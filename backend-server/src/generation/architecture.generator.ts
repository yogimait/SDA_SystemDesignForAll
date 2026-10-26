import type {
  ArchitectureModel,
  ConfirmedRequirements,
  DsaModel,
  HldModel,
  LldDsaOutput,
  LldModel,
  RegenerateScope,
  TokenUsage,
  ValidationIssue,
  ValidationReport,
  ZodError,
  ZodType,
} from "@sda/contracts";
import {
  ArchitectureModelSchema,
  DsaModelSchema,
  HldModelSchema,
  LldDsaOutputSchema,
  LldModelSchema,
} from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import { invalidOutputRepair } from "./output-issues.js";
import type {
  ChatMessage,
  ModelProvider,
} from "../providers/model-provider.js";
import { zodToJsonSchema } from "../providers/json-schema.js";
import {
  buildRepairMessage,
  dsaRegenerateUserPrompt,
  hldRegenerateUserPrompt,
  hldSystemPrompt,
  hldUserPrompt,
  lldDsaSystemPrompt,
  lldDsaUserPrompt,
  lldRegenerateUserPrompt,
} from "../providers/prompts/index.js";
import {
  collectElementIds,
  pruneLearningSteps,
  toValidationReport,
  validateArchitectureModel,
  validateHldSection,
  validateLldDsaSection,
} from "../architecture/validator.js";
import { addUsage } from "./requirements.generator.js";

const MAX_ATTEMPTS = 3; // initial call + 2 bounded repairs
// Large structured generations can legitimately take several minutes; the
// timeout must cover body streaming, not just response headers.
const HLD_TIMEOUT_MS = 360_000;
const LLD_DSA_TIMEOUT_MS = 900_000;
const HLD_MAX_TOKENS = 12_000;
const LLD_DSA_MAX_TOKENS = 64_000;

const HLD_SCHEMA = zodToJsonSchema(HldModelSchema);
const LLD_DSA_SCHEMA = zodToJsonSchema(LldDsaOutputSchema);
const LLD_SCHEMA = zodToJsonSchema(LldModelSchema);
const DSA_SCHEMA = zodToJsonSchema(DsaModelSchema);

export interface HldGeneration {
  hld: HldModel;
  usage: TokenUsage;
  attempts: number;
}

export interface LldDsaGeneration {
  section: LldDsaOutput;
  usage: TokenUsage;
  attempts: number;
}

export interface ScopedGeneration {
  model: ArchitectureModel;
  report: ValidationReport;
  usage: TokenUsage;
  attempts: number;
}

/**
 * Two-phase architecture generation and scoped regeneration. Section calls are
 * repaired with the exact failing rule list; untouched sections stay untouched.
 */
export class ArchitectureGenerator {
  async generateHld(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
  ): Promise<HldGeneration> {
    const system = hldSystemPrompt();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: hldUserPrompt(idea, JSON.stringify(requirements.spec)),
      },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];
    const stageName = "hld_model";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: stageName,
          jsonSchema: HLD_SCHEMA,
          maxOutputTokens: HLD_MAX_TOKENS,
          timeoutMs: HLD_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        const parsed = HldModelSchema.safeParse(result.data);
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateHldSection(parsed.data, requirements);
          if (validation.errors.length === 0) {
            return { hld: parsed.data, usage, attempts: attempt };
          }
          issues = validation.errors;
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push(
            { role: "assistant", content: JSON.stringify(result.data) },
            {
              role: "user",
              content: buildRepairMessage(result.data, issues),
            },
          );
        }
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "INVALID_MODEL_OUTPUT"
        ) {
          const failure = invalidOutputRepair(error, stageName, attempt);
          issues = [failure.issue];
          if (attempt < MAX_ATTEMPTS) {
            messages.push({
              role: "user",
              content: failure.message,
            });
          }
          continue;
        }
        throw error;
      }
    }

    throw new AppError(
      "GENERATION_REPAIR_FAILED",
      "The HLD stayed invalid after two repair attempts.",
      { stage: "hld_model", attempts: MAX_ATTEMPTS, issues: issues.slice(0, 12) },
    );
  }

  async generateLldDsa(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    hld: HldModel,
  ): Promise<LldDsaGeneration> {
    const system = lldDsaSystemPrompt();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: lldDsaUserPrompt(
          idea,
          JSON.stringify(requirements.spec),
          JSON.stringify(hld),
        ),
      },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];
    const stageName = "lld_dsa_model";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: stageName,
          jsonSchema: LLD_DSA_SCHEMA,
          maxOutputTokens: LLD_DSA_MAX_TOKENS,
          timeoutMs: LLD_DSA_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        const parsed = LldDsaOutputSchema.safeParse(result.data);
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateLldDsaSection(
            parsed.data,
            hld,
            requirements,
          );
          if (validation.errors.length === 0) {
            return { section: parsed.data, usage, attempts: attempt };
          }
          issues = validation.errors;
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push(
            { role: "assistant", content: JSON.stringify(result.data) },
            {
              role: "user",
              content: buildRepairMessage(result.data, issues),
            },
          );
        }
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "INVALID_MODEL_OUTPUT"
        ) {
          const failure = invalidOutputRepair(error, stageName, attempt);
          issues = [failure.issue];
          if (attempt < MAX_ATTEMPTS) {
            messages.push({
              role: "user",
              content: failure.message,
            });
          }
          continue;
        }
        throw error;
      }
    }

    throw new AppError(
      "GENERATION_REPAIR_FAILED",
      "The LLD/DSA output stayed invalid after two repair attempts.",
      {
        stage: "lld_dsa_model",
        attempts: MAX_ATTEMPTS,
        issues: issues.slice(0, 12),
      },
    );
  }

  buildModel(
    requirements: ConfirmedRequirements,
    hld: HldModel,
    section: LldDsaOutput,
  ): ArchitectureModel {
    return {
      meta: section.meta,
      requirements,
      hld,
      lld: section.lld,
      dsa: section.dsa,
      learningSteps: section.learningSteps,
    };
  }

  async regenerateScoped(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    current: ArchitectureModel,
    scope: RegenerateScope,
    requirementsDiff: string,
  ): Promise<ScopedGeneration> {
    const configuration = scopedConfiguration(
      scope,
      idea,
      requirements,
      current,
      requirementsDiff,
    );
    const stageName = configuration.schemaName;
    const messages: ChatMessage[] = [
      { role: "user", content: configuration.userPrompt },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let sectionData: unknown;
      try {
        const result = await provider.generateStructured({
          model,
          system: configuration.system,
          messages,
          schemaName: configuration.schemaName,
          jsonSchema: configuration.jsonSchema,
          maxOutputTokens: configuration.maxOutputTokens,
          timeoutMs: LLD_DSA_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        sectionData = result.data;
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "INVALID_MODEL_OUTPUT"
        ) {
          const failure = invalidOutputRepair(error, stageName, attempt);
          issues = [failure.issue];
          if (attempt < MAX_ATTEMPTS) {
            messages.push({
              role: "user",
              content: failure.message,
            });
          }
          continue;
        }
        throw error;
      }

      const parsed = configuration.parse(sectionData);
      if (!parsed.success) {
        issues = schemaIssues(parsed.error.issues);
      } else {
        const composed = configuration.merge(parsed.data);
        if (!composed.ok) {
          issues = [composed.error];
        } else {
          const schemaValidation = ArchitectureModelSchema.safeParse(
            composed.model,
          );
          if (!schemaValidation.success) {
            issues = schemaIssues(schemaValidation.error.issues);
          } else {
            const validation = validateArchitectureModel(composed.model);
            const warnings = [
              ...validation.warnings,
              ...composed.warnings,
            ];
            if (validation.errors.length === 0) {
              return {
                model: composed.model,
                report: toValidationReport({
                  errors: [],
                  warnings,
                }),
                usage,
                attempts: attempt,
              };
            }
            issues = validation.errors;
          }
        }
      }

      if (attempt < MAX_ATTEMPTS) {
        messages.push(
          {
            role: "assistant",
            content: JSON.stringify(sectionData) ?? "null",
          },
          {
            role: "user",
            content: buildRepairMessage(sectionData, issues),
          },
        );
      }
    }

    throw new AppError(
      "GENERATION_REPAIR_FAILED",
      `The ${scope.toUpperCase()} section stayed invalid after two repair attempts.`,
      { scope, attempts: MAX_ATTEMPTS, issues: issues.slice(0, 12) },
    );
  }
}

interface ScopedConfiguration {
  system: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  parse: (
    data: unknown,
  ) => { success: true; data: HldModel | LldModel | DsaModel } | { success: false; error: ZodError };
  merge: (data: HldModel | LldModel | DsaModel) => MergeResult;
}

type MergeResult =
  | { ok: true; model: ArchitectureModel; warnings: ValidationIssue[] }
  | { ok: false; error: ValidationIssue };

function scopedConfiguration(
  scope: RegenerateScope,
  idea: string,
  requirements: ConfirmedRequirements,
  current: ArchitectureModel,
  requirementsDiff: string,
): ScopedConfiguration {
  if (scope === "hld") {
    return {
      system: hldSystemPrompt(),
      userPrompt: hldRegenerateUserPrompt(
        idea,
        JSON.stringify(requirements.spec),
        requirementsDiff,
      ),
      schemaName: "hld_model",
      jsonSchema: HLD_SCHEMA,
      maxOutputTokens: HLD_MAX_TOKENS,
      parse: (data) => parseWith(HldModelSchema, data),
      merge: (data) => {
        const hld = data as HldModel;
        const draft: ArchitectureModel = { ...current, hld };
        return mergeWithPrunedLearning(draft);
      },
    };
  }

  if (scope === "lld") {
    return {
      system: lldDsaSystemPrompt(),
      userPrompt: lldRegenerateUserPrompt(
        idea,
        JSON.stringify(requirements.spec),
        JSON.stringify(current.hld),
        requirementsDiff,
      ),
      schemaName: "lld_model",
      jsonSchema: LLD_SCHEMA,
      maxOutputTokens: LLD_DSA_MAX_TOKENS,
      parse: (data) => parseWith(LldModelSchema, data),
      merge: (data) => {
        const lld = data as LldModel;
        const draft: ArchitectureModel = { ...current, lld };
        return mergeWithPrunedLearning(draft);
      },
    };
  }

  return {
    system: lldDsaSystemPrompt(),
    userPrompt: dsaRegenerateUserPrompt(
      idea,
      JSON.stringify(requirements.spec),
      JSON.stringify(current.hld),
      JSON.stringify(current.lld),
      requirementsDiff,
    ),
    schemaName: "dsa_model",
    jsonSchema: DSA_SCHEMA,
    maxOutputTokens: LLD_DSA_MAX_TOKENS,
    parse: (data) => parseWith(DsaModelSchema, data),
    merge: (data) => {
      const dsa = data as DsaModel;
      const draft: ArchitectureModel = { ...current, dsa };
      return mergeWithPrunedLearning(draft);
    },
  };
}

function parseWith<T>(
  schema: ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: ZodError } {
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, error: parsed.error };
}

function mergeWithPrunedLearning(
  draft: ArchitectureModel,
): MergeResult {
  const known = collectElementIds(draft);
  const pruned = pruneLearningSteps(draft.learningSteps, known);
  if (pruned.steps.length === 0) {
    return {
      ok: false,
      error: {
        rule: "learning_steps_pruned",
        severity: "error",
        message:
          "Every learning step referenced an element removed by this regeneration. Regenerate the full architecture instead.",
      },
    };
  }
  const warnings = pruned.removedRefs.map(
    (ref): ValidationIssue => ({
      rule: "stale_learning_ref_pruned",
      severity: "warning",
      message: `Learning reference "${ref}" was removed because the element no longer exists.`,
    }),
  );
  return {
    ok: true,
    model: { ...draft, learningSteps: pruned.steps },
    warnings,
  };
}

function schemaIssues(
  issues: Array<{ path: PropertyKey[]; code: string; message: string }>,
): ValidationIssue[] {
  return issues.map((issue) => ({
    rule: `schema:${issue.code}`,
    severity: "error",
    message: `${issue.path.map(String).join(".") || "body"}: ${issue.message}`,
  }));
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/** Human-readable diff for regeneration prompts. */
export function summarizeRequirementsDiff(
  previous: ConfirmedRequirements,
  current: ConfirmedRequirements,
): string {
  if (JSON.stringify(previous.spec) === JSON.stringify(current.spec)) {
    return "No requirement changes.";
  }

  const before = new Map(
    [...previous.spec.functional, ...previous.spec.nonFunctional].map(
      (item) => [item.id, item],
    ),
  );
  const after = new Map(
    [...current.spec.functional, ...current.spec.nonFunctional].map((item) => [
      item.id,
      item,
    ]),
  );

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [id, item] of after) {
    const old = before.get(id);
    if (!old) {
      added.push(item.text);
    } else if (
      old.text !== item.text ||
      old.priority !== item.priority ||
      ("target" in old ? old.target : "") !==
        ("target" in item ? item.target : "")
    ) {
      changed.push(item.text);
    }
  }
  for (const [id, item] of before) {
    if (!after.has(id)) {
      removed.push(item.text);
    }
  }

  return JSON.stringify({ added, removed, changed });
}
