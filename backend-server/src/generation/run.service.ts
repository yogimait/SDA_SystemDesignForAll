import { Inject, Injectable } from "@nestjs/common";
import type {
  GenerationOptions,
  GenerationRun,
  RegenerateScope,
  RunType,
  StartRunResponse,
  TokenUsage,
} from "@sda/contracts";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import { isActiveRunConflict } from "../common/errors/database-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  ARCHITECTURE_REPOSITORY,
  type ArchitectureRepository,
} from "../database/repositories/architecture.repository.js";
import type { ProjectRow } from "../database/repositories/project.repository.js";
import type { UserRow } from "../database/repositories/user.repository.js";
import { PlanService } from "../plans/plan.service.js";
import {
  RUN_REPOSITORY,
  type RunRepository,
  type RunRow,
  type StageRow,
} from "../database/repositories/run.repository.js";
import { ProviderRegistry } from "../providers/provider.registry.js";
import { GenerationBudgetService } from "./generation-budget.service.js";
import { GenerationWorker } from "./generation.worker.js";
import {
  RunEventsService,
  toRunStreamRunEvent,
} from "./run-events.service.js";

const REQUIREMENTS_STAGES = ["analyze_idea", "persist"];
const ARCHITECTURE_STAGES = [
  "hld_model",
  "lld_dsa_model",
  "validate",
  "persist",
];

@Injectable()
export class RunService {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(ARCHITECTURE_REPOSITORY)
    private readonly architectures: ArchitectureRepository,
    private readonly registry: ProviderRegistry,
    private readonly worker: GenerationWorker,
    private readonly plans: PlanService,
    private readonly events: RunEventsService,
    private readonly budget: GenerationBudgetService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async startRequirements(
    project: ProjectRow,
    options: GenerationOptions,
    actor?: UserRow,
  ): Promise<StartRunResponse> {
    await this.plans.assertCanStartRun(actor, project);
    return this.startRun(
      project,
      "requirements",
      null,
      options,
      [...REQUIREMENTS_STAGES],
    );
  }

  async startArchitecture(
    project: ProjectRow,
    options: GenerationOptions,
    actor?: UserRow,
  ): Promise<StartRunResponse> {
    if (!project.requirementsSnapshot) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Confirm the requirements specification before generating an architecture.",
        { reason: "requirements_not_confirmed" },
      );
    }
    await this.plans.assertCanStartRun(actor, project);
    return this.startRun(
      project,
      "architecture",
      null,
      options,
      [...ARCHITECTURE_STAGES],
    );
  }

  async startRegeneration(
    project: ProjectRow,
    scope: RegenerateScope,
    options: GenerationOptions,
    actor?: UserRow,
  ): Promise<StartRunResponse> {
    if (!project.requirementsSnapshot) {
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
    this.plans.assertCanRegenerate(actor, project);
    await this.plans.assertCanStartRun(actor, project);
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
    return this.startRun(
      project,
      "architecture",
      scope,
      options,
      [`${scope}_model`, "validate", "persist"],
    );
  }

  async getRun(runId: string): Promise<GenerationRun> {
    const run = await this.runs.findById(runId);
    if (!run) {
      throw new AppError("RUN_NOT_FOUND");
    }
    const stages = await this.runs.listStages(runId);
    return toRunDto(run, stages);
  }

  private async startRun(
    project: ProjectRow,
    type: RunType,
    scope: RegenerateScope | null,
    options: GenerationOptions,
    stageNames: string[],
  ): Promise<StartRunResponse> {
    await this.budget.assertCanStart();
    if (await this.runs.hasActiveRun(project.id)) {
      throw new AppError("RUN_CONFLICT");
    }
    assertQueueCapacity(
      await this.runs.countActive(),
      this.config.GENERATION_MAX_QUEUED,
    );

    const providerId = options.provider ?? this.registry.defaultProvider;
    const model = options.model ?? this.registry.defaultModel;
    // The hosted server key powers every run. No user-supplied key is needed.
    const provider = this.registry.resolve(providerId);

    const runId = randomUUID();
    const inputHash = project.requirementsSnapshot
      ? hash(JSON.stringify(project.requirementsSnapshot.spec))
      : "";

    // Bind the hosted provider before the worker can claim the run. The key
    // lives only inside this closure for the lifetime of the run.
    this.worker.registerProvider(runId, provider);
    let created: RunRow;
    try {
      created = await this.runs.create({
        id: runId,
        projectId: project.id,
        type,
        provider: this.registry.mockEnabled ? "mock" : providerId,
        model,
        scope,
        inputHash,
        stages: stageNames,
      });
    } catch (error) {
      this.worker.unregisterProvider(runId);
      if (isActiveRunConflict(error)) {
        throw new AppError("RUN_CONFLICT");
      }
      throw error;
    }

    this.events.publish(runId, toRunStreamRunEvent(created, emptyUsage()));
    this.worker.wake();
    return { runId };
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Exported for the run-service unit check; branch is intentionally tiny. */
export function assertQueueCapacity(active: number, limit: number): void {
  if (active >= limit) {
    throw new AppError(
      "QUOTA_EXCEEDED",
      "The generation queue is full. Try again in a few minutes.",
      { reason: "generation_queue_full", limit, active },
    );
  }
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function toRunDto(run: RunRow, stages: StageRow[]): GenerationRun {
  const usage: TokenUsage = {
    promptTokens: run.usagePromptTokens,
    completionTokens: run.usageCompletionTokens,
    totalTokens: run.usagePromptTokens + run.usageCompletionTokens,
  };
  return {
    id: run.id,
    projectId: run.projectId,
    type: run.type,
    status: run.status,
    provider: run.provider,
    model: run.model,
    scope: run.scope,
    stages: stages.map((stage) => ({
      name: stage.name,
      status: stage.status,
      attempt: stage.attempt,
      startedAt: stage.startedAt?.toISOString() ?? null,
      finishedAt: stage.finishedAt?.toISOString() ?? null,
      error: stage.errorCode
        ? {
            code: stage.errorCode,
            message: stage.errorMessage ?? "",
            ...(stage.errorDetails ? { details: stage.errorDetails } : {}),
          }
        : null,
      usage:
        stage.usagePromptTokens > 0 || stage.usageCompletionTokens > 0
          ? {
              promptTokens: stage.usagePromptTokens,
              completionTokens: stage.usageCompletionTokens,
              totalTokens:
                stage.usagePromptTokens + stage.usageCompletionTokens,
            }
          : null,
    })),
    error: run.errorCode
      ? {
          code: run.errorCode,
          message: run.errorMessage ?? "",
          ...(run.errorDetails ? { details: run.errorDetails } : {}),
        }
      : null,
    usage,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
