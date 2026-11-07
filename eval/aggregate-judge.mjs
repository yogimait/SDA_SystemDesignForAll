import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "eval", "artifacts", "judge");
const files = readdirSync(dir)
  .filter((name) => /^architecture-glm-.*\.jsonl$/.test(name))
  .map((name) => ({ name, path: join(dir, name) }))
  .sort((a, b) => a.name.localeCompare(b.name));
if (files.length === 0) throw new Error("No architecture judge JSONL found");
const latest = files.at(-1);
const records = readFileSync(latest.path, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const dimensions = [
  "traceability",
  "hld_boundaries",
  "lld_responsibility",
  "dsa_correctness",
  "simplicity",
  "pedagogical_quality",
  "learning_quality",
  "interview_usefulness",
];
const scored = records.filter((record) => record.status === "scored" && record.scores);
const mean = (values) =>
  values.length === 0 ? null : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
const dimensionMeans = Object.fromEntries(
  dimensions.map((key) => [key, mean(scored.map((record) => record.scores[key]))]),
);
const flags = {};
for (const record of records) {
  for (const flag of record.hard_flags ?? []) flags[flag] = (flags[flag] ?? 0) + 1;
}
const byCase = {};
for (const record of records) {
  byCase[record.case_id] ??= { runs: 0, mean: 0, flags: 0 };
  byCase[record.case_id].runs += 1;
  byCase[record.case_id].mean += record.mean ?? 0;
  byCase[record.case_id].flags += (record.hard_flags ?? []).length;
}
const cases = Object.entries(byCase).map(([caseId, value]) => ({
  case_id: caseId,
  runs: value.runs,
  mean: Number((value.mean / value.runs).toFixed(2)),
  flags: value.flags,
}));

const summary = {
  artifact: latest.name,
  judge_model: records[0]?.judge_model,
  records: records.length,
  scored: scored.length,
  successful: records.filter((record) => record.success === true).length,
  hard_flags: records.filter((record) => (record.hard_flags ?? []).length > 0).length,
  mean: mean(scored.map((record) => record.mean)),
  dimension_means: dimensionMeans,
  flag_counts: flags,
  cases,
  input_tokens: records.reduce((sum, record) => sum + (record.input_tokens ?? 0), 0),
  output_tokens: records.reduce((sum, record) => sum + (record.output_tokens ?? 0), 0),
};
const jsonPath = join(dir, "aggregate-architecture-judge.json");
writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

const lines = [
  "# Architecture semantic judge",
  "",
  `Judge model: \`${summary.judge_model}\``,
  `Records: ${summary.records}`,
  `Scored: ${summary.scored}`,
  `Successful (mean >= 4 and no hard flags): ${summary.successful}`,
  `Records with hard flags: ${summary.hard_flags}`,
  `Mean: ${summary.mean}/5`,
  "",
  "## Dimension means",
  "",
  "| Dimension | Mean |",
  "|---|---:|",
  ...dimensions.map((key) => `| ${key} | ${summary.dimension_means[key]} |`),
  "",
  "## Hard flags",
  "",
  "| Flag | Count |",
  "|---|---:|",
  ...Object.entries(flags)
    .sort((a, b) => b[1] - a[1])
    .map(([flag, count]) => `| ${flag} | ${count} |`),
  "",
  "## Per-case means",
  "",
  "| Case | Runs | Mean | Flags |",
  "|---|---:|---:|---:|",
  ...cases.map((entry) => `| ${entry.case_id} | ${entry.runs} | ${entry.mean} | ${entry.flags} |`),
  "",
  "## Interpretation",
  "",
  "Structural validity is not semantic quality. Hard flags are review items, not proof of correctness.",
  "Human calibration is required before using these scores as a release gate.",
  "",
];
const mdPath = join(dir, "aggregate-architecture-judge.md");
writeFileSync(mdPath, lines.join("\n"));
console.log(JSON.stringify({ ...summary, output: jsonPath, report: mdPath }, null, 2));
