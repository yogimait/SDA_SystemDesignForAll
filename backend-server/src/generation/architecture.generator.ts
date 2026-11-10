import type {
  ArchitectureModel,
  ConfirmedRequirements,
  DsaModel,
  HldModel,
  LearningStep,
  LldDsaOutput,
  LldModel,
  LldStageOutput,
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
  DsaStageOutputSchema,
  HldModelSchema,
  LearningOutputSchema,
  LldStageOutputSchema,
} from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import {
  invalidOutputIssue,
  invalidOutputRepair,
  isTruncatedOutput,
} from "./output-issues.js";
import type { GenerationAttemptListener } from "./attempt-listener.js";
import type {
  ChatMessage,
  ModelProvider,
} from "../providers/model-provider.js";
import { zodToJsonSchema } from "../providers/json-schema.js";
import {
  buildRepairMessage,
  dsaRegenerateUserPrompt,
  dsaSystemPrompt,
  dsaUserPrompt,
  hldRegenerateUserPrompt,
  hldSystemPrompt,
  hldUserPrompt,
  learningSystemPrompt,
  learningUserPrompt,
  lldRegenerateUserPrompt,
  lldSystemPrompt,
  lldUserPrompt,
} from "../providers/prompts/index.js";
import {
  compactHld,
  compactLld,
  compactRequirements,
} from "../providers/prompts/compact-context.js";
import {
  collectElementIds,
  pruneLearningSteps,
  toValidationReport,
  validateArchitectureModel,
  validateDsaSection,
  validateHldSection,
  validateLearningSection,
  validateLldSection,
} from "../architecture/validator.js";
import {
  hldMustHaveIssues,
  lldMustHaveIssues,
  mergedMustHaveIssues,
} from "../architecture/must-have-coverage.js";
import { addUsage } from "./requirements.generator.js";

const MAX_ATTEMPTS = 3; // initial call + 2 bounded repairs
// Large structured generations can legitimately take several minutes; the
// timeout must cover body streaming, not just response headers.
const HLD_TIMEOUT_MS = 900_000;
const LLD_DSA_TIMEOUT_MS = 900_000;
// GLM-5.3 Flash truncated the HLD at 32k (finish_reason=length) on small ideas,
// so the HLD budget now matches the LLD/DSA budget.
const HLD_MAX_TOKENS = 64_000;
const LLD_MAX_TOKENS = 64_000;
const DSA_MAX_TOKENS = 64_000;
const LEARNING_MAX_TOKENS = 64_000;

/** Truncation retry: same budget, smaller expected output. */
const HLD_TRUNCATION_RETRY = [
  "Your previous response was cut off before the JSON object closed.",
  "Return a more compact HLD: at most 8 components, 10 connections, 1-2 flows,",
  "one-sentence summaries, and no optional prose. Keep the same JSON schema.",
].join(" ");

const HLD_SCHEMA = zodToJsonSchema(HldModelSchema);
const LLD_STAGE_SCHEMA = zodToJsonSchema(LldStageOutputSchema);
const LLD_SCHEMA = zodToJsonSchema(LldStageOutputSchema);
const DSA_SCHEMA = zodToJsonSchema(DsaModelSchema);
const DSA_STAGE_SCHEMA = zodToJsonSchema(DsaStageOutputSchema);
const LEARNING_SCHEMA = zodToJsonSchema(LearningOutputSchema);

export interface HldGeneration {
  hld: HldModel;
  usage: TokenUsage;
  attempts: number;
}

export interface LldGeneration {
  meta: LldStageOutput["meta"];
  lld: LldModel;
  usage: TokenUsage;
  attempts: number;
}

export interface DsaGeneration {
  dsa: DsaModel;
  usage: TokenUsage;
  attempts: number;
}

export interface LearningGeneration {
  learningSteps: LearningStep[];
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
    onAttempt?: GenerationAttemptListener,
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
      onAttempt?.(attempt);
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
        const parsed = HldModelSchema.safeParse(
          normalizeRelationshipMultiplicities(
            sanitizeRequirementRefs(result.data, requirements),
          ),
        );
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateHldSection(parsed.data, requirements);
          if (validation.errors.length === 0) {
            const coverage = hldMustHaveIssues(parsed.data, requirements.spec);
            if (coverage.length === 0) {
              return { hld: parsed.data, usage, attempts: attempt };
            }
            issues = coverage;
          } else {
            issues = validation.errors;
          }
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content: buildRepairMessage(result.data, issues),
          });
        }
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "INVALID_MODEL_OUTPUT"
        ) {
          if (isTruncatedOutput(error)) {
            const issue = invalidOutputIssue(error);
            issues = [issue];
            if (attempt < MAX_ATTEMPTS) {
              messages.push({ role: "user", content: HLD_TRUNCATION_RETRY });
              continue;
            }
            throw new AppError(
              "GENERATION_REPAIR_FAILED",
              "The HLD response stayed truncated after the compact retry. Lower reasoning effort or raise the output budget.",
              {
                stage: stageName,
                attempts: attempt,
                issues: [issue],
                providerOutput: error.details,
              },
            );
          }
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
      coverageOnly(issues)
        ? "The HLD still ignores must-have requirements after two repair attempts."
        : "The HLD stayed invalid after two repair attempts.",
      { stage: "hld_model", attempts: MAX_ATTEMPTS, issues: issues.slice(0, 12) },
    );
  }

  async generateLld(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    hld: HldModel,
    onAttempt?: GenerationAttemptListener,
  ): Promise<LldGeneration> {
    const system = lldSystemPrompt();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: lldUserPrompt(
          idea,
          JSON.stringify(compactRequirements(requirements.spec)),
          JSON.stringify(compactHld(hld)),
        ),
      },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];
    const stageName = "lld_model";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      onAttempt?.(attempt);
      try {
        const result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: stageName,
          jsonSchema: LLD_STAGE_SCHEMA,
          maxOutputTokens: LLD_MAX_TOKENS,
          timeoutMs: LLD_DSA_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        const parsed = LldStageOutputSchema.safeParse(
          normalizeLldRelationships(
            normalizeRelationshipMultiplicities(
              sanitizeRequirementRefs(result.data, requirements),
            ),
          ),
        );
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateLldSection(
            parsed.data.lld,
            requirements,
          );
          const coverage = lldMustHaveIssues(
            hld,
            parsed.data.lld,
            requirements.spec,
          );
          if (validation.errors.length === 0 && coverage.length === 0) {
            return {
              meta: parsed.data.meta,
              lld: parsed.data.lld,
              usage,
              attempts: attempt,
            };
          }
          issues =
            validation.errors.length > 0 ? validation.errors : coverage;
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content: buildRepairMessage(result.data, issues),
          });
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
      coverageOnly(issues)
        ? "The LLD still ignores must-have requirements after two repair attempts."
        : "The LLD stayed invalid after two repair attempts.",
      {
        stage: "lld_model",
        attempts: MAX_ATTEMPTS,
        issues: issues.slice(0, 12),
      },
    );
  }

  async generateDsa(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    hld: HldModel,
    lld: LldModel,
    onAttempt?: GenerationAttemptListener,
  ): Promise<DsaGeneration> {
    const system = dsaSystemPrompt();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: dsaUserPrompt(
          idea,
          JSON.stringify(compactRequirements(requirements.spec)),
          JSON.stringify(compactHld(hld)),
          JSON.stringify(compactLld(lld)),
        ),
      },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];
    const stageName = "dsa_model";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      onAttempt?.(attempt);
      try {
        const result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: stageName,
          jsonSchema: DSA_STAGE_SCHEMA,
          maxOutputTokens: DSA_MAX_TOKENS,
          timeoutMs: LLD_DSA_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        const parsed = DsaStageOutputSchema.safeParse(
          sanitizeRequirementRefs(result.data, requirements),
        );
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateDsaSection(
            parsed.data,
            requirements,
          );
          if (validation.errors.length === 0) {
            return {
              dsa: parsed.data,
              usage,
              attempts: attempt,
            };
          }
          issues = validation.errors;
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content: buildRepairMessage(result.data, issues),
          });
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
      "The DSA stayed invalid after two repair attempts.",
      {
        stage: "dsa_model",
        attempts: MAX_ATTEMPTS,
        issues: issues.slice(0, 12),
      },
    );
  }

  async generateLearning(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    hld: HldModel,
    lld: LldModel,
    dsa: DsaModel,
    onAttempt?: GenerationAttemptListener,
  ): Promise<LearningGeneration> {
    const system = learningSystemPrompt();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: learningUserPrompt(
          idea,
          JSON.stringify(compactRequirements(requirements.spec)),
          JSON.stringify(compactHld(hld)),
          JSON.stringify(compactLld(lld)),
          JSON.stringify(dsa),
        ),
      },
    ];
    const usage = emptyUsage();
    let issues: ValidationIssue[] = [];
    const stageName = "learning_model";
    const known = collectElementIds({
      meta: { title: "learning", summary: "learning" },
      requirements,
      hld,
      lld,
      dsa,
      learningSteps: [],
    });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      onAttempt?.(attempt);
      try {
        const result = await provider.generateStructured({
          model,
          system,
          messages,
          schemaName: stageName,
          jsonSchema: LEARNING_SCHEMA,
          maxOutputTokens: LEARNING_MAX_TOKENS,
          timeoutMs: LLD_DSA_TIMEOUT_MS,
        });
        addUsage(usage, result.usage);
        const parsed = LearningOutputSchema.safeParse(
          sanitizeLearningOutput(result.data, hld, lld, dsa),
        );
        if (!parsed.success) {
          issues = schemaIssues(parsed.error.issues);
        } else {
          const validation = validateLearningSection(
            parsed.data.learningSteps,
            known,
          );
          if (validation.errors.length === 0) {
            return {
              learningSteps: parsed.data.learningSteps,
              usage,
              attempts: attempt,
            };
          }
          issues = validation.errors;
        }

        if (attempt < MAX_ATTEMPTS) {
          messages.push({
            role: "user",
            content: buildRepairMessage(result.data, issues),
          });
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
      "The learning steps stayed invalid after two repair attempts.",
      {
        stage: "learning_model",
        attempts: MAX_ATTEMPTS,
        issues: issues.slice(0, 12),
      },
    );
  }

  async generateLldDsa(
    provider: ModelProvider,
    model: string,
    idea: string,
    requirements: ConfirmedRequirements,
    hld: HldModel,
    onAttempt?: GenerationAttemptListener,
  ): Promise<LldDsaGeneration> {
    const lld = await this.generateLld(
      provider,
      model,
      idea,
      requirements,
      hld,
      onAttempt,
    );
    const dsa = await this.generateDsa(
      provider,
      model,
      idea,
      requirements,
      hld,
      lld.lld,
      onAttempt,
    );
    const learning = await this.generateLearning(
      provider,
      model,
      idea,
      requirements,
      hld,
      lld.lld,
      dsa.dsa,
      onAttempt,
    );
    const section: LldDsaOutput = {
      meta: lld.meta,
      lld: lld.lld,
      dsa: dsa.dsa,
      learningSteps: learning.learningSteps,
    };
    const coverage = mergedMustHaveIssues(
      hld,
      section,
      requirements.spec,
    );
    const attempts =
      1 +
      Math.max(0, lld.attempts - 1) +
      Math.max(0, dsa.attempts - 1) +
      Math.max(0, learning.attempts - 1);
    if (coverage.length > 0) {
      throw new AppError(
        "GENERATION_REPAIR_FAILED",
        "The split architecture stages left a must-have requirement uncovered.",
        {
          stage: "lld_dsa_model",
          attempts,
          issues: coverage.slice(0, 12),
        },
      );
    }

    const usage = emptyUsage();
    addUsage(usage, lld.usage);
    addUsage(usage, dsa.usage);
    addUsage(usage, learning.usage);
    return {
      section,
      usage,
      attempts,
    };
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
    onAttempt?: GenerationAttemptListener,
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
      onAttempt?.(attempt);
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

      const parsed = configuration.parse(
        normalizeLldRelationships(
          normalizeRelationshipMultiplicities(
            sanitizeRequirementRefs(sectionData, requirements),
          ),
        ),
      );
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
        messages.push({
          role: "user",
          content: buildRepairMessage(sectionData, issues),
        });
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
  ) =>
    | { success: true; data: HldModel | LldStageOutput | DsaModel }
    | { success: false; error: ZodError };
  merge: (data: HldModel | LldStageOutput | DsaModel) => MergeResult;
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
      system: lldSystemPrompt(),
      userPrompt: lldRegenerateUserPrompt(
        idea,
        JSON.stringify(compactRequirements(requirements.spec)),
        JSON.stringify(compactHld(current.hld)),
        requirementsDiff,
      ),
      schemaName: "lld_model",
      jsonSchema: LLD_SCHEMA,
      maxOutputTokens: LLD_MAX_TOKENS,
      parse: (data) => parseWith(LldStageOutputSchema, data),
      merge: (data) => {
        const lld = (data as LldStageOutput).lld;
        const draft: ArchitectureModel = { ...current, lld };
        return mergeWithPrunedLearning(draft);
      },
    };
  }

  return {
    system: dsaSystemPrompt(),
    userPrompt: dsaRegenerateUserPrompt(
      idea,
      JSON.stringify(compactRequirements(requirements.spec)),
      JSON.stringify(compactHld(current.hld)),
      JSON.stringify(compactLld(current.lld)),
      requirementsDiff,
    ),
    schemaName: "dsa_model",
    jsonSchema: DSA_SCHEMA,
    maxOutputTokens: DSA_MAX_TOKENS,
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

/**
 * Drops hallucinated requirement references before schema parsing. A stray
 * `fr_...` must not fail a complete diagram after two repairs; known ids are
 * preserved, unknown/invalid ones are removed and surface as semantic
 * warnings later.
 */
function sanitizeRequirementRefs<T>(
  value: T,
  requirements: ConfirmedRequirements,
): T {
  const known = new Set([
    ...requirements.spec.functional.map((item) => item.id),
    ...requirements.spec.nonFunctional.map((item) => item.id),
  ]);

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    if (node === null || typeof node !== "object") {
      return node;
    }
    const record = { ...(node as Record<string, unknown>) };
    if (Array.isArray(record.requirementRefs)) {
      record.requirementRefs = record.requirementRefs.filter(
        (ref): ref is string =>
          typeof ref === "string" && known.has(ref),
      );
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "requirementRefs") {
        record[key] = visit(child);
      }
    }
    return record;
  };

  return visit(value) as T;
}

/**
 * Normalizes relationship multiplicity mistakes that have one correct UML
 * answer: the whole side of aggregation/composition is "1"/"0..1", and
 * inheritance/realization use "1" on both ends. This avoids paying for a
 * repair request for a deterministic mistake.
 */
function normalizeRelationshipMultiplicities<T>(value: T): T {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    if (node === null || typeof node !== "object") {
      return node;
    }
    const record = { ...(node as Record<string, unknown>) };
    if (
      typeof record.kind === "string" &&
      typeof record.sourceMultiplicity === "string" &&
      typeof record.targetMultiplicity === "string"
    ) {
      if (
        ["aggregation", "composition"].includes(record.kind) &&
        !["1", "0..1"].includes(record.sourceMultiplicity)
      ) {
        record.sourceMultiplicity = "1";
      }
      if (
        ["inheritance", "realization"].includes(record.kind) &&
        (record.sourceMultiplicity !== "1" ||
          record.targetMultiplicity !== "1")
      ) {
        record.sourceMultiplicity = "1";
        record.targetMultiplicity = "1";
      }
    }
    for (const [key, child] of Object.entries(record)) {
      record[key] = visit(child);
    }
    return record;
  };
  return visit(value) as T;
}

/**
 * Converts a relationship whose declared UML kind is impossible for its
 * endpoints into an association. The design intent is preserved, and the
 * validator no longer spends a repair call on a deterministic mismatch.
 */
function normalizeLldRelationships<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const lld = (value as { lld?: LldModel }).lld;
  if (!lld || !Array.isArray(lld.classes) || !Array.isArray(lld.relationships)) {
    return value;
  }
  const classes = new Map(lld.classes.map((item) => [item.id, item]));
  const classLike = (kind: string): boolean =>
    kind === "class" || kind === "abstract";
  const structural = (kind: string): boolean =>
    classLike(kind) || kind === "value_object";

  for (const relationship of lld.relationships) {
    const source = classes.get(relationship.sourceId);
    const target = classes.get(relationship.targetId);
    if (!source || !target) continue;
    if (
      ["aggregation", "composition"].includes(relationship.kind) &&
      (!structural(source.kind) || !structural(target.kind))
    ) {
      relationship.kind = "association";
    }
    if (
      relationship.kind === "realization" &&
      (target.kind !== "interface" || source.kind === "interface")
    ) {
      relationship.kind = "association";
    }
    if (
      relationship.kind === "inheritance" &&
      (!classLike(source.kind) ||
        !classLike(target.kind) ||
        source.id === target.id)
    ) {
      relationship.kind = "association";
    }
  }
  return value;
}

function sanitizeLearningOutput(
  value: unknown,
  hld: HldModel,
  lld: LldModel,
  dsa: DsaModel,
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return sanitizeLearningRefs(
    {
      ...(value as Record<string, unknown>),
      lld,
      dsa,
    },
    hld,
  );
}

/**
 * Drops learning-step references that do not point at an architecture element
 * (models sometimes use requirement ids such as `nfr_...`). Steps left with no
 * valid references are removed; the schema still requires at least one step.
 */
function sanitizeLearningRefs<T>(value: T, hld: HldModel): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.learningSteps)) {
    return value;
  }
  const known = new Set<string>();
  const addIds = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string"
      ) {
        known.add((item as { id: string }).id);
      }
    }
  };
  const lld = record.lld as Record<string, unknown> | undefined;
  const dsa = record.dsa as Record<string, unknown> | undefined;
  addIds(lld?.classes);
  addIds(lld?.relationships);
  addIds(lld?.patterns);
  addIds(dsa?.recommendations);
  addIds(dsa?.algorithmicPatterns);
  addIds(hld.components);
  addIds(hld.connections);
  addIds(hld.flows);
  addIds(hld.technologyDecisions);
  addIds(hld.scalabilityNotes);
  addIds(hld.failureScenarios);

  const learningSteps = record.learningSteps
    .filter(
      (step): step is Record<string, unknown> =>
        step !== null &&
        typeof step === "object" &&
        Array.isArray((step as { elementRefs?: unknown }).elementRefs),
    )
    .map((step) => ({
      ...step,
      elementRefs: (step.elementRefs as unknown[]).filter(
        (ref): ref is string => typeof ref === "string" && known.has(ref),
      ),
    }))
    .filter((step) => step.elementRefs.length > 0);
  return { ...record, learningSteps } as T;
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

/** Distinguishes an ignored must-have from generic schema/validation failure. */
function coverageOnly(issues: ValidationIssue[]): boolean {
  return (
    issues.length > 0 &&
    issues.every((issue) => issue.rule === "unreferenced_must_requirement")
  );
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
