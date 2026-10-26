import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import type {
  ArchitectureModel,
  ConfirmedRequirements,
  HldModel,
  TokenUsage,
  ValidationReport,
} from "@sda/contracts";
import { HldModelSchema } from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../common/errors/app-error.js";
import {
  toValidationReport,
  validateArchitectureModel,
  validateHldSection,
} from "../architecture/validator.js";
import {
  ARCHITECTURE_REPOSITORY,
  type ArchitectureRepository,
} from "../database/repositories/architecture.repository.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from "../database/repositories/project.repository.js";
import {
  REQUIREMENTS_REPOSITORY,
  type RequirementsRepository,
} from "../database/repositories/project.repository.js";
import {
  RUN_REPOSITORY,
  type RunRepository,
  type RunRow,
} from "../database/repositories/run.repository.js";
import type { ModelProvider } from "../providers/model-provider.js";
import {
  ArchitectureGenerator,
  summarizeRequirementsDiff,
} from "./architecture.generator.js";
import {
  addUsage,
  RequirementsGenerator,
} from "./requirements.generator.js";

interface RunState {
  stage?: string;
  usage: TokenUsage;
}

@Injectable()
export class GenerationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(GenerationWorker.name);
  private readonly providers = new Map<string, ModelProvider>();
  private interval?: NodeJS.Timeout;
  private processing = false;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(REQUIREMENTS_REPOSITORY)
    private readonly requirements: RequirementsRepository,
    @Inject(ARCHITECTURE_REPOSITORY)
    private readonly architectures: ArchitectureRepository,
    private readonly requirementsGenerator: RequirementsGenerator,
    private readonly architectureGenerator: ArchitectureGenerator,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.runs.reconcileInterrupted();
    if (interrupted > 0) {
      this.logger.warn(
        `Marked ${interrupted} generation run(s) as interrupted at startup.`,
      );
    }
    this.interval = setInterval(() => {
      void this.tick();
    }, this.config.GENERATION_POLL_INTERVAL_MS);
    this.interval.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  registerProvider(runId: string, provider: ModelProvider): void {
    this.providers.set(runId, provider);
  }

  unregisterProvider(runId: string): void {
    this.providers.delete(runId);
  }

  wake(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.processing) {
      return;
    }
    this.processing = true;
    try {
      const run = await this.runs.claimNextQueued();
      if (run) {
        await this.processRun(run);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "Worker tick failed.",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processRun(run: RunRow): Promise<void> {
    const provider = this.providers.get(run.id);
    if (!provider) {
      await this.failRun(
        run,
        { usage: emptyUsage() },
        new AppError(
          "PROVIDER_AUTH_FAILED",
          "Provider credentials are no longer available. Start the run again.",
        ),
      );
      return;
    }

    const state: RunState = { usage: emptyUsage() };
    try {
      if (run.type === "requirements") {
        await this.processRequirements(run, provider, state);
      } else if (run.scope) {
        await this.processScoped(run, provider, state);
      } else {
        await this.processArchitecture(run, provider, state);
      }
    } catch (error) {
      await this.failRun(run, state, error);
    } finally {
      this.providers.delete(run.id);
    }
  }

  private async processRequirements(
    run: RunRow,
    provider: ModelProvider,
    state: RunState,
  ): Promise<void> {
    const project = await this.projects.findById(run.projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }

    await this.beginStage(run, "analyze_idea", state);
    const generated = await this.requirementsGenerator.generate(
      provider,
      run.model,
      project.idea,
    );
    addUsage(state.usage, generated.usage);
    await this.runs.updateStage(run.id, "analyze_idea", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: generated.attempts,
      usagePromptTokens: generated.usage.promptTokens,
      usageCompletionTokens: generated.usage.completionTokens,
    });

    await this.beginStage(run, "persist", state);
    await this.requirements.replace(project.id, generated.spec);
    await this.projects.update(project.id, {
      status: "requirements_ready",
      requirementsConfirmedAt: null,
      requirementsSnapshot: null,
    });
    await this.runs.updateStage(run.id, "persist", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: 0,
    });

    await this.completeRun(run, state, generated.attempts - 1);
  }

  private async processArchitecture(
    run: RunRow,
    provider: ModelProvider,
    state: RunState,
  ): Promise<void> {
    const project = await this.projects.findById(run.projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    const requirements = project.requirementsSnapshot;
    if (!requirements) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Confirm the requirements specification before generating an architecture.",
        { reason: "requirements_not_confirmed" },
      );
    }

    await this.beginStage(run, "hld_model", state);
    const hld = await this.loadOrGenerateHld(run, provider, project.idea, requirements);
    addUsage(state.usage, hld.usage);
    await this.runs.updateStage(run.id, "hld_model", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: hld.attempts,
      result: hld.hld,
      usagePromptTokens: hld.usage.promptTokens,
      usageCompletionTokens: hld.usage.completionTokens,
    });

    await this.beginStage(run, "lld_dsa_model", state);
    const lldDsa = await this.architectureGenerator.generateLldDsa(
      provider,
      run.model,
      project.idea,
      requirements,
      hld.hld,
    );
    addUsage(state.usage, lldDsa.usage);
    await this.runs.updateStage(run.id, "lld_dsa_model", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: lldDsa.attempts,
      result: lldDsa.section,
      usagePromptTokens: lldDsa.usage.promptTokens,
      usageCompletionTokens: lldDsa.usage.completionTokens,
    });

    await this.beginStage(run, "validate", state);
    const model = this.architectureGenerator.buildModel(
      requirements,
      hld.hld,
      lldDsa.section,
    );
    const validation = validateArchitectureModel(model);
    if (validation.errors.length > 0) {
      throw new AppError(
        "GENERATION_REPAIR_FAILED",
        "The merged architecture failed final validation.",
        { stage: "validate", issues: validation.errors.slice(0, 12) },
      );
    }
    const report = toValidationReport(validation);
    await this.runs.updateStage(run.id, "validate", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: 0,
      result: report,
    });

    await this.persistVersion(
      run,
      project.id,
      model,
      report,
      requirements,
      state,
    );
    await this.completeRun(
      run,
      state,
      Math.max(0, hld.attempts - 1) + Math.max(0, lldDsa.attempts - 1),
    );
  }

  private async processScoped(
    run: RunRow,
    provider: ModelProvider,
    state: RunState,
  ): Promise<void> {
    if (!run.scope) {
      throw new AppError("INTERNAL_ERROR", "Scoped run is missing its scope.");
    }
    const project = await this.projects.findById(run.projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    const requirements = project.requirementsSnapshot;
    if (!requirements) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Confirm the requirements specification before regenerating an architecture.",
        { reason: "requirements_not_confirmed" },
      );
    }
    if (project.currentArchitectureVersion === null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generate an architecture before regenerating a section.",
        { reason: "architecture_not_generated" },
      );
    }
    const current = await this.architectures.findByProjectAndVersion(
      project.id,
      project.currentArchitectureVersion,
    );
    if (!current) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The current architecture version could not be loaded.",
        { reason: "architecture_not_generated" },
      );
    }

    const stageName = `${run.scope}_model`;
    await this.beginStage(run, stageName, state);
    const generated = await this.architectureGenerator.regenerateScoped(
      provider,
      run.model,
      project.idea,
      requirements,
      current.model,
      run.scope,
      summarizeRequirementsDiff(current.requirementsSnapshot, requirements),
    );
    addUsage(state.usage, generated.usage);
    await this.runs.updateStage(run.id, stageName, {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: generated.attempts,
      result: { scope: run.scope, validation: generated.report },
      usagePromptTokens: generated.usage.promptTokens,
      usageCompletionTokens: generated.usage.completionTokens,
    });

    await this.beginStage(run, "validate", state);
    await this.runs.updateStage(run.id, "validate", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: 0,
      result: generated.report,
    });

    await this.persistVersion(
      run,
      project.id,
      generated.model,
      generated.report,
      requirements,
      state,
    );
    await this.completeRun(run, state, generated.attempts - 1);
  }

  private async loadOrGenerateHld(
    run: RunRow,
    provider: ModelProvider,
    idea: string,
    requirements: ConfirmedRequirements,
  ): Promise<{ hld: HldModel; usage: TokenUsage; attempts: number }> {
    const reusable = await this.runs.findReusableHld(
      run.projectId,
      run.inputHash,
    );
    if (reusable) {
      const parsed = HldModelSchema.safeParse(reusable);
      if (
        parsed.success &&
        validateHldSection(parsed.data, requirements).errors.length === 0
      ) {
        return {
          hld: parsed.data,
          usage: emptyUsage(),
          attempts: 0,
        };
      }
    }

    const generated = await this.architectureGenerator.generateHld(
      provider,
      run.model,
      idea,
      requirements,
    );
    return generated;
  }

  private async persistVersion(
    run: RunRow,
    projectId: string,
    model: ArchitectureModel,
    report: ValidationReport,
    requirements: ConfirmedRequirements,
    state: RunState,
  ): Promise<void> {
    await this.beginStage(run, "persist", state);
    const version = await this.architectures.nextVersion(projectId);
    await this.architectures.create({
      id: randomUUID(),
      projectId,
      version,
      model,
      validationReport: report,
      requirementsSnapshot: requirements,
      createdByRunId: run.id,
    });
    await this.projects.update(projectId, {
      status: "architecture_ready",
      currentArchitectureVersion: version,
    });
    await this.runs.updateStage(run.id, "persist", {
      status: "succeeded",
      finishedAt: new Date(),
      attempt: 0,
    });
  }

  private async beginStage(
    run: RunRow,
    stage: string,
    state: RunState,
  ): Promise<void> {
    state.stage = stage;
    await this.runs.updateStage(run.id, stage, {
      status: "running",
      startedAt: new Date(),
    });
  }

  private async completeRun(
    run: RunRow,
    state: RunState,
    retryCount: number,
  ): Promise<void> {
    await this.runs.updateRun(run.id, {
      status: "succeeded",
      finishedAt: new Date(),
      usagePromptTokens: state.usage.promptTokens,
      usageCompletionTokens: state.usage.completionTokens,
      retryCount: Math.max(0, retryCount),
    });
  }

  private async failRun(
    run: RunRow,
    state: RunState,
    error: unknown,
  ): Promise<void> {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "Generation failed unexpectedly.");
    if (state.stage) {
      await this.runs.updateStage(run.id, state.stage, {
        status: "failed",
        finishedAt: new Date(),
        errorCode: appError.code,
        errorMessage: appError.message,
        errorDetails: appError.details ?? null,
      });
    }
    await this.runs.updateRun(run.id, {
      status: "failed",
      finishedAt: new Date(),
      errorCode: appError.code,
      errorMessage: appError.message,
      errorDetails: appError.details ?? null,
      usagePromptTokens: state.usage.promptTokens,
      usageCompletionTokens: state.usage.completionTokens,
    });
    this.logger.warn(`Run ${run.id} failed with ${appError.code}.`);
  }
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
