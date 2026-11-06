import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { dirname, join, resolve } from "node:path";
import {
  HldModelSchema,
  LldDsaOutputSchema,
  RequirementsSpecSchema,
} from "@sda/contracts";
import { RequirementsGenerator } from "../backend-server/dist/generation/requirements.generator.js";
import { ArchitectureGenerator } from "../backend-server/dist/generation/architecture.generator.js";
import { OpenRouterProvider } from "../backend-server/dist/providers/openrouter/openrouter.provider.js";
import {
  collectElementIds,
  validateArchitectureModel,
  validateHldSection,
  validateLldDsaSection,
} from "../backend-server/dist/architecture/validator.js";
import {
  hldMustHaveIssues,
  mergedMustHaveIssues,
} from "../backend-server/dist/architecture/must-have-coverage.js";

const root = resolve(dirname(process.argv[1]), "..");
const datasetDir = join(root, "eval", "datasets", "sda-v1");
const envPath = join(root, "backend-server", ".env");
if (existsSync(envPath)) loadEnvFile(envPath);

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const model = arg("--model", "z-ai/glm-5.3-flash");
const stageMode = arg("--stage", "architecture");
const limit = Number(arg("--limit", "1"));
const repeats = Number(arg("--repeats", "1"));
const caseId = arg("--case", undefined);
const split = arg("--split", undefined);
const outputArg = arg("--out", undefined);
const output = resolve(
  root,
  outputArg ??
    join(
      "eval",
      "artifacts",
      "structural",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${model.replace(/[^a-z0-9]+/gi, "_")}.jsonl`,
    ),
);

if (!["requirements", "hld", "lld_dsa", "architecture"].includes(stageMode)) {
  throw new Error("--stage must be requirements, hld, lld_dsa, or architecture");
}
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error("--limit must be a positive integer");
}
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) {
  throw new Error("--repeats must be between 1 and 5");
}
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not set; add it to backend-server/.env");
}

if (!existsSync(join(root, "backend-server", "dist", "generation", "requirements.generator.js"))) {
  throw new Error("Backend dist missing; run: npm run build --workspace backend-server");
}

const cases = readFileSync(join(datasetDir, "cases.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line))
  .filter((item) => (caseId ? item.id === caseId : true))
  .filter((item) => (split ? item.split === split : true))
  .slice(0, limit);

if (cases.length === 0) throw new Error("No cases matched");

const provider = new OpenRouterProvider(globalThis.fetch, {
  OPENROUTER_REASONING_EFFORT: process.env.OPENROUTER_REASONING_EFFORT ?? "low",
}).bind(process.env.OPENROUTER_API_KEY);

const requirementsGenerator = new RequirementsGenerator();
const architectureGenerator = new ArchitectureGenerator();

const modelCatalog = await fetch("https://openrouter.ai/api/v1/models")
  .then((response) => (response.ok ? response.json() : { data: [] }))
  .catch(() => ({ data: [] }));
const modelInfo = (modelCatalog.data ?? []).find((entry) => entry.id === model);
const pricing = modelInfo?.pricing
  ? { prompt: Number(modelInfo.pricing.prompt), completion: Number(modelInfo.pricing.completion) }
  : null;

function costOf(usage) {
  if (!pricing || !usage) return null;
  return usage.promptTokens * pricing.prompt + usage.completionTokens * pricing.completion;
}

function toConfirmed(item) {
  return {
    confirmedAt: "2026-11-07T00:00:00.000Z",
    spec: {
      functional: item.confirmed_requirements.functional.map((entry) => ({
        id: entry.id,
        kind: "functional",
        text: entry.text,
        priority: entry.priority,
      })),
      nonFunctional: item.confirmed_requirements.nonFunctional.map((entry) => ({
        id: entry.id,
        kind: "nonfunctional",
        text: entry.text,
        priority: entry.priority,
        category: entry.category,
        target: entry.target ?? "",
      })),
      assumptions: item.confirmed_requirements.assumptions.map((text, index) => ({
        id: `asm_${index + 1}`,
        text,
      })),
      clarifications: item.confirmed_requirements.clarifications.map((question, index) => ({
        id: `q_${index + 1}`,
        question,
        answer: "",
      })),
    },
  };
}

function issueSummary(issues) {
  return issues.slice(0, 20).map((issue) => ({
    rule: issue.rule,
    path: issue.path ?? null,
    message: issue.message,
    severity: issue.severity,
  }));
}

function errorSummary(error) {
  if (error && typeof error === "object") {
    return {
      name: error.name ?? "Error",
      code: error.code ?? null,
      message: String(error.message ?? "").slice(0, 1000),
      details: error.details ?? null,
    };
  }
  return { name: "Error", code: null, message: String(error), details: null };
}

function metricsForHld(hld) {
  return {
    components: hld.components.length,
    connections: hld.connections.length,
    flows: hld.flows.length,
    technologyDecisions: hld.technologyDecisions.length,
    scalabilityNotes: hld.scalabilityNotes.length,
    failureScenarios: hld.failureScenarios.length,
  };
}

function metricsForLldDsa(section) {
  return {
    classes: section.lld.classes.length,
    relationships: section.lld.relationships.length,
    patterns: section.lld.patterns.length,
    dsaRecommendations: section.dsa.recommendations.length,
    algorithmicPatterns: section.dsa.algorithmicPatterns.length,
    learningSteps: section.learningSteps.length,
    dsaWithComplexity: section.dsa.recommendations.filter(
      (entry) => entry.complexity.average !== "" && entry.complexity.worst !== "",
    ).length,
    classesWithRefs: section.lld.classes.filter((entry) => entry.requirementRefs.length > 0).length,
    dsaWithRefs: section.dsa.recommendations.filter((entry) => entry.requirementRefs.length > 0).length,
  };
}

function metricsForLearning(section, merged) {
  const known = merged ? collectElementIds(merged) : new Set();
  const refs = section.learningSteps.flatMap((step) => step.elementRefs);
  const uniqueRefs = new Set(refs);
  const resolvedRefs = refs.filter((ref) => known.has(ref));
  return {
    steps: section.learningSteps.length,
    refs: refs.length,
    uniqueRefs: uniqueRefs.size,
    resolvedRefs: resolvedRefs.length,
    unresolvedRefs: refs.length - resolvedRefs.length,
    refsResolvedRate: refs.length === 0 ? 0 : resolvedRefs.length / refs.length,
  };
}

const results = [];
for (const item of cases) {
  for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex += 1) {
  const confirmed = toConfirmed(item);
  const started = performance.now();
  const record = {
    eval_run_id: randomUUID(),
    timestamp: new Date().toISOString(),
    dataset_version: item.dataset_version,
    case_id: item.id,
    split: item.split,
    domain: item.domain,
    complexity: item.complexity,
    repeat_index: repeatIndex,
    model,
    stage_mode: stageMode,
    pricing: pricing ? { input_per_token: pricing.prompt, output_per_token: pricing.completion } : null,
    component_metrics: {
      requirements: null,
      hld: null,
      lld: null,
      dsa: null,
      learning: null,
    },
    stages: {},
    structural: {
      valid: false,
      errors: [],
      warnings: [],
      must_have_issues: [],
    },
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    cost_usd: null,
    duration_ms: 0,
    error: null,
    raw: {},
  };

  const addUsage = (usage) => {
    if (!usage) return;
    record.usage.promptTokens += usage.promptTokens ?? 0;
    record.usage.completionTokens += usage.completionTokens ?? 0;
    record.usage.totalTokens += usage.totalTokens ?? 0;
  };

  try {
    if (stageMode === "requirements") {
      const stageStart = performance.now();
      const attempts = [];
      const generated = await requirementsGenerator.generate(
        provider,
        model,
        item.idea,
        (attempt) => attempts.push(attempt),
      );
      record.stages.requirements = {
        ok: true,
        attempts: generated.attempts,
        attempt_events: attempts,
        duration_ms: Math.round(performance.now() - stageStart),
        usage: generated.usage,
        metrics: {
          functional: generated.spec.functional.length,
          nonFunctional: generated.spec.nonFunctional.length,
          nfrTargetsPresent: generated.spec.nonFunctional.filter((entry) => entry.target.trim() !== "").length,
          assumptions: generated.spec.assumptions.length,
          clarifications: generated.spec.clarifications.length,
        },
      };
      addUsage(generated.usage);
      record.component_metrics.requirements = record.stages.requirements.metrics;
      const schema = RequirementsSpecSchema.safeParse(generated.spec);
      record.structural.valid = schema.success;
      if (!schema.success) {
        record.structural.errors = schema.error.issues.map((issue) => ({
          rule: "schema",
          path: issue.path.join("."),
          message: issue.message,
          severity: "error",
        }));
      }
      record.raw.requirements = generated.spec;
    }

    if (stageMode === "hld" || stageMode === "lld_dsa" || stageMode === "architecture") {
      const hldStart = performance.now();
      const hld = await architectureGenerator.generateHld(
        provider,
        model,
        item.idea,
        confirmed,
      );
      const hldSchema = HldModelSchema.safeParse(hld.hld);
      const hldValidation = hldSchema.success
        ? validateHldSection(hldSchema.data, confirmed)
        : { errors: [], warnings: [] };
      const hldCoverage = hldSchema.success
        ? hldMustHaveIssues(hldSchema.data, confirmed.spec)
        : [];
      record.stages.hld = {
        ok: hldSchema.success,
        attempts: hld.attempts,
        duration_ms: Math.round(performance.now() - hldStart),
        usage: hld.usage,
        metrics: hldSchema.success ? metricsForHld(hld.hld) : null,
        errors: issueSummary(hldValidation.errors),
        warnings: issueSummary(hldValidation.warnings),
        must_have_issues: issueSummary(hldCoverage),
      };
      addUsage(hld.usage);
      record.component_metrics.hld = record.stages.hld.metrics;
      record.raw.hld = hld.hld;
      record.structural.errors.push(...issueSummary(hldValidation.errors));
      record.structural.warnings.push(...issueSummary(hldValidation.warnings));
      record.structural.must_have_issues.push(...issueSummary(hldCoverage));

      if (stageMode === "lld_dsa" || stageMode === "architecture") {
        const lldStart = performance.now();
        const section = await architectureGenerator.generateLldDsa(
          provider,
          model,
          item.idea,
          confirmed,
          hld.hld,
        );
        const sectionSchema = LldDsaOutputSchema.safeParse(section.section);
        const sectionValidation = sectionSchema.success
          ? validateLldDsaSection(sectionSchema.data, hld.hld, confirmed)
          : { errors: [], warnings: [] };
        const mergedCoverage = sectionSchema.success
          ? mergedMustHaveIssues(hld.hld, sectionSchema.data, confirmed.spec)
          : [];
        const merged = sectionSchema.success
          ? architectureGenerator.buildModel(confirmed, hld.hld, sectionSchema.data)
          : null;
        const fullValidation = merged ? validateArchitectureModel(merged) : { errors: [], warnings: [] };
        record.stages.lld_dsa = {
          ok: sectionSchema.success,
          attempts: section.attempts,
          duration_ms: Math.round(performance.now() - lldStart),
          usage: section.usage,
          metrics: sectionSchema.success ? metricsForLldDsa(section.section) : null,
          errors: issueSummary(sectionValidation.errors),
          warnings: issueSummary(sectionValidation.warnings),
          must_have_issues: issueSummary(mergedCoverage),
          final_errors: issueSummary(fullValidation.errors),
          final_warnings: issueSummary(fullValidation.warnings),
        };
        addUsage(section.usage);
        if (sectionSchema.success) {
          const metrics = metricsForLldDsa(section.section);
          record.component_metrics.lld = {
            classes: metrics.classes,
            relationships: metrics.relationships,
            patterns: metrics.patterns,
            classesWithRefs: metrics.classesWithRefs,
          };
          record.component_metrics.dsa = {
            recommendations: metrics.dsaRecommendations,
            algorithmicPatterns: metrics.algorithmicPatterns,
            withComplexity: metrics.dsaWithComplexity,
            withRefs: metrics.dsaWithRefs,
          };
          record.component_metrics.learning = metricsForLearning(section.section, merged);
        }
        record.raw.lld_dsa = section.section;
        record.structural.errors.push(...issueSummary(sectionValidation.errors), ...issueSummary(fullValidation.errors));
        record.structural.warnings.push(...issueSummary(sectionValidation.warnings), ...issueSummary(fullValidation.warnings));
        record.structural.must_have_issues.push(...issueSummary(mergedCoverage));
        record.structural.valid =
          hldSchema.success &&
          sectionSchema.success &&
          hldValidation.errors.length === 0 &&
          sectionValidation.errors.length === 0 &&
          fullValidation.errors.length === 0 &&
          hldCoverage.length === 0 &&
          mergedCoverage.length === 0;
      } else {
        record.structural.valid =
          hldSchema.success &&
          hldValidation.errors.length === 0 &&
          hldCoverage.length === 0;
      }
    }
  } catch (error) {
    record.error = errorSummary(error);
    record.structural.valid = false;
  }

  record.duration_ms = Math.round(performance.now() - started);
  record.cost_usd = costOf(record.usage);
  results.push(record);
  }
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, results.map((record) => JSON.stringify(record)).join("\n") + "\n");

const uniqueCaseIds = [...new Set(results.map((record) => record.case_id))];
const byCase = Object.groupBy(results, (record) => record.case_id);
const summary = {
  ok: results.every((record) => record.structural.valid),
  output,
  model,
  stage_mode: stageMode,
  repeats,
  runs: results.length,
  unique_cases: uniqueCaseIds.length,
  valid_runs: results.filter((record) => record.structural.valid).length,
  invalid_runs: results.filter((record) => !record.structural.valid).length,
  pass_at_1: uniqueCaseIds.filter(
    (id) => byCase[id]?.find((record) => record.repeat_index === 1)?.structural.valid === true,
  ).length,
  pass_at_repeats: uniqueCaseIds.filter(
    (id) => byCase[id]?.every((record) => record.structural.valid) === true,
  ).length,
  errors: results.reduce((count, record) => count + (record.error ? 1 : 0), 0),
  usage: results.reduce(
    (sum, record) => ({
      promptTokens: sum.promptTokens + record.usage.promptTokens,
      completionTokens: sum.completionTokens + record.usage.completionTokens,
      totalTokens: sum.totalTokens + record.usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  ),
  cost_usd: results.reduce((sum, record) => sum + (record.cost_usd ?? 0), 0),
  duration_ms: results.reduce((sum, record) => sum + record.duration_ms, 0),
  cases_detail: results.map((record) => ({
    case_id: record.case_id,
    repeat_index: record.repeat_index,
    valid: record.structural.valid,
    duration_ms: record.duration_ms,
    usage: record.usage,
    cost_usd: record.cost_usd,
    error: record.error?.code ?? null,
    stage_errors: Object.fromEntries(
      Object.entries(record.stages).map(([name, stage]) => [
        name,
        { ok: stage.ok, errors: stage.errors?.length ?? 0, warnings: stage.warnings?.length ?? 0 },
      ]),
    ),
  })),
};
writeFileSync(output.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
