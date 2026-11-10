import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(root, "eval", "artifacts", "structural");
const stage = process.argv.includes("--stage")
  ? process.argv[process.argv.indexOf("--stage") + 1]
  : "requirements";

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

const summaries = readdirSync(artifactDir)
  .filter((name) => name.endsWith(".summary.json"))
  .map((name) => {
    const path = join(artifactDir, name);
    const summary = JSON.parse(readFileSync(path, "utf8"));
    return { name, path, summary };
  })
  .filter(({ summary }) => summary.stage_mode === stage);

const bestByModel = new Map();
for (const entry of summaries) {
  if (!entry.summary.model) continue;
  const current = bestByModel.get(entry.summary.model);
  const entryScore = [
    entry.summary.unique_cases ?? 0,
    entry.summary.repeats ?? 1,
    statSync(entry.path).mtimeMs,
  ];
  const currentScore = current
    ? [current.summary.unique_cases ?? 0, current.summary.repeats ?? 1, current.summary.timestamp ?? ""]
    : null;
  const better =
    currentScore === null ||
    entryScore[0] > currentScore[0] ||
    (entryScore[0] === currentScore[0] && entryScore[1] > currentScore[1]) ||
    (entryScore[0] === currentScore[0] &&
      entryScore[1] === currentScore[1] &&
      entryScore[2] > currentScore[2]);
  if (better) bestByModel.set(entry.summary.model, entry);
}

const models = [];
for (const [model, entry] of bestByModel) {
  const jsonlPath = entry.path.replace(/\.summary\.json$/, ".jsonl");
  const records = readFileSync(jsonlPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const uniqueCases = [...new Set(records.map((record) => record.case_id))];
  const byCase = Object.groupBy(records, (record) => record.case_id);
  const durations = records.map((record) => record.duration_ms);
  const totals = records.reduce(
    (acc, record) => ({
      promptTokens: acc.promptTokens + record.usage.promptTokens,
      completionTokens: acc.completionTokens + record.usage.completionTokens,
      totalTokens: acc.totalTokens + record.usage.totalTokens,
      cost: acc.cost + (record.cost_usd ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
  );
  const requirementsMetrics = records
    .map((record) => record.component_metrics?.requirements)
    .filter(Boolean);
  const average = (key) =>
    requirementsMetrics.length === 0
      ? null
      : requirementsMetrics.reduce((sum, metric) => sum + (metric[key] ?? 0), 0) /
        requirementsMetrics.length;

  const componentAverage = (component, keys) => {
    const metrics = records
      .map((record) => record.component_metrics?.[component])
      .filter(Boolean);
    if (metrics.length === 0) return null;
    return Object.fromEntries(
      keys.map((key) => [
        key,
        Number(
          (
            metrics.reduce((sum, metric) => sum + (metric[key] ?? 0), 0) /
            metrics.length
          ).toFixed(3),
        ),
      ]),
    );
  };

  models.push({
    model,
    runs: records.length,
    unique_cases: uniqueCases.length,
    valid_runs: records.filter((record) => record.structural.valid).length,
    pass_at_1: uniqueCases.filter(
      (id) => byCase[id]?.find((record) => record.repeat_index === 1)?.structural.valid === true,
    ).length,
    pass_at_repeats: uniqueCases.filter(
      (id) => byCase[id]?.every((record) => record.structural.valid) === true,
    ).length,
    failed_runs: records.filter((record) => record.error !== null).length,
    avg_duration_ms: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    p95_duration_ms: p95(durations),
    avg_tokens: Math.round(totals.totalTokens / records.length),
    total_tokens: totals.totalTokens,
    cost_usd: Number(totals.cost.toFixed(6)),
    cost_per_valid: Number((totals.cost / Math.max(1, records.filter((record) => record.structural.valid).length)).toFixed(6)),
    requirements: {
      avg_functional: average("functional"),
      avg_nonFunctional: average("nonFunctional"),
      avg_nfr_targets_present: average("nfrTargetsPresent"),
      avg_assumptions: average("assumptions"),
      avg_clarifications: average("clarifications"),
    },
    component_averages: {
      hld: componentAverage("hld", [
        "components",
        "connections",
        "flows",
        "technologyDecisions",
        "scalabilityNotes",
        "failureScenarios",
      ]),
      lld: componentAverage("lld", [
        "classes",
        "relationships",
        "patterns",
        "classesWithRefs",
      ]),
      dsa: componentAverage("dsa", [
        "recommendations",
        "algorithmicPatterns",
        "withComplexity",
        "withRefs",
      ]),
      learning: componentAverage("learning", [
        "steps",
        "refs",
        "uniqueRefs",
        "resolvedRefs",
        "unresolvedRefs",
        "refsResolvedRate",
      ]),
    },
  });
}

models.sort((a, b) => a.cost_per_valid - b.cost_per_valid || b.pass_at_1 - a.pass_at_1);

const output = {
  stage,
  models,
  generated_at: new Date().toISOString(),
};
const jsonPath = join(artifactDir, `aggregate-${stage}.json`);
writeFileSync(jsonPath, JSON.stringify(output, null, 2));

const header = [
  "| Model | Runs | Pass@1 | Pass@repeats | Avg ms | p95 ms | Avg tokens | Cost | Cost/valid |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
];
const rows = models.map(
  (model) =>
    `| \`${model.model}\` | ${model.runs} | ${model.pass_at_1}/${model.unique_cases} | ${model.pass_at_repeats}/${model.unique_cases} | ${model.avg_duration_ms} | ${model.p95_duration_ms} | ${model.avg_tokens} | $${model.cost_usd} | $${model.cost_per_valid} |`,
);
const md = `# ${stage} matrix\n\n${header.join("\n")}\n\n${rows.join("\n")}\n`;
writeFileSync(join(artifactDir, `aggregate-${stage}.md`), md);
console.log(JSON.stringify(output, null, 2));
console.log(`\n${md}`);
