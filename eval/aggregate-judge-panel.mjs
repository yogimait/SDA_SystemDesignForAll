import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(process.argv[1]), "..");
const dir = resolve(
  root,
  process.argv.includes("--dir")
    ? process.argv[process.argv.indexOf("--dir") + 1]
    : "eval/artifacts/judge/v3-panel",
);
const DEFAULT_DIMENSIONS = [
  "traceability",
  "hld_boundaries",
  "lld_responsibility",
  "dsa_correctness",
  "simplicity",
  "pedagogical_quality",
  "learning_quality",
  "interview_usefulness",
];

function flagName(flag) {
  if (typeof flag === "string") return flag.split(":")[0].trim();
  if (flag && typeof flag === "object") {
    return String(flag.flag ?? flag.code ?? flag.type ?? JSON.stringify(flag));
  }
  return String(flag);
}

function mean(values) {
  return values.length === 0
    ? null
    : Number(
        (
          values.reduce((sum, value) => sum + value, 0) / values.length
        ).toFixed(3),
      );
}

const files = readdirSync(dir)
  .filter((name) => /^judge-.*\.jsonl$/.test(name))
  .filter((name) => !name.includes("missing"))
  .sort();
if (files.length === 0) throw new Error(`No judge-*.jsonl files in ${dir}`);

const judges = files.map((name) => {
  const path = join(dir, name);
  const rows = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const scored = rows.filter((row) => row.status === "scored" && row.scores);
  const byKey = new Map(
    rows.map((row) => [`${row.case_id}#${row.repeat_index}`, row]),
  );
  const flags = {};
  for (const row of rows) {
    for (const flag of row.hard_flags ?? []) {
      const name = flagName(flag);
      flags[name] = (flags[name] ?? 0) + 1;
    }
  }
  return {
    file: name,
    model: [...new Set(rows.map((row) => row.judge_model))].join(", "),
    rows,
    scored,
    byKey,
    summary: {
      records: rows.length,
      scored: scored.length,
      successful: rows.filter(
        (row) =>
          row.status === "scored" &&
          row.mean >= 4 &&
          (row.hard_flags ?? []).length === 0,
      ).length,
      hard_flag_records: rows.filter((row) => (row.hard_flags ?? []).length > 0)
        .length,
      mean: mean(scored.map((row) => row.mean)),
      dimension_means: Object.fromEntries(
        [...new Set(scored.flatMap((row) => Object.keys(row.scores)))].map(
          (key) => [key, mean(scored.map((row) => row.scores[key]))],
        ),
      ),
      flag_counts: flags,
    },
  };
});

const dimensions = [
  ...new Set(
    judges.flatMap((judge) =>
      judge.scored.flatMap((row) => Object.keys(row.scores)),
    ),
  ),
];
if (dimensions.length === 0) dimensions.push(...DEFAULT_DIMENSIONS);

const keys = [
  ...new Set(
    judges.flatMap((judge) => [...judge.byKey.keys()]),
  ),
].sort();
const cases = keys.map((key) => {
  const rows = judges.map((judge) => judge.byKey.get(key)).filter(Boolean);
  const scored = rows.filter((row) => row.status === "scored" && row.scores);
  const means = scored.map((row) => row.mean);
  const flags = Object.fromEntries(
    judges.map((judge) => [
      judge.model,
      (judge.byKey.get(key)?.hard_flags ?? []).map(flagName),
    ]),
  );
  return {
    key,
    case_id: rows[0]?.case_id,
    repeat_index: rows[0]?.repeat_index,
    means,
    mean: mean(means),
    mean_abs_difference:
      means.length === 2 ? Math.abs(means[0] - means[1]) : null,
    flags,
    statuses: rows.map((row) => row.status),
  };
});

const paired = cases.filter((item) => item.means.length === 2);
const dimensionPairs = [];
for (const key of keys) {
  const rows = judges
    .map((judge) => judge.byKey.get(key))
    .filter((row) => row?.status === "scored" && row.scores);
  if (rows.length !== 2) continue;
  for (const dimension of dimensions) {
    dimensionPairs.push({
      dimension,
      difference: Math.abs(
        rows[0].scores[dimension] - rows[1].scores[dimension],
      ),
    });
  }
}
const dimensionAgreement = Object.fromEntries(
  dimensions.map((dimension) => {
    const values = dimensionPairs
      .filter((item) => item.dimension === dimension)
      .map((item) => item.difference);
    return [
      dimension,
      {
        exact: values.filter((value) => value === 0).length,
        within_one: values.filter((value) => value <= 1).length,
        total: values.length,
        mean_abs_difference: mean(values),
      },
    ];
  }),
);

const summary = {
  generated_at: new Date().toISOString(),
  judges: judges.map((judge) => ({
    model: judge.model,
    file: judge.file,
    summary: judge.summary,
  })),
  paired_outputs: paired.length,
  mean_absolute_difference: mean(
    paired.map((item) => item.mean_abs_difference),
  ),
  dimension_agreement: dimensionAgreement,
  cases,
};
writeFileSync(
  join(dir, "aggregate-v3-panel.json"),
  JSON.stringify(summary, null, 2) + "\n",
);

const lines = [
  "# Architecture judge panel — v3",
  "",
  `Generated: ${summary.generated_at}`,
  `Paired outputs: ${summary.paired_outputs}`,
  `Mean absolute score difference: ${summary.mean_absolute_difference}/5`,
  "",
  "## Judge summaries",
  "",
  "| Judge | Scored | Mean | Success (>=4, no flags) | Hard-flag records |",
  "|---|---:|---:|---:|---:|",
  ...judges.map(
    (judge) =>
      `| ${judge.model} | ${judge.summary.scored}/${judge.summary.records} | ${judge.summary.mean} | ${judge.summary.successful} | ${judge.summary.hard_flag_records} |`,
  ),
  "",
  "## Dimension means",
  "",
  "| Dimension | " +
    judges.map((judge) => judge.model).join(" | ") +
    " |",
  "|---|" + judges.map(() => "---:|").join(""),
  ...dimensions.map(
    (dimension) =>
      `| ${dimension} | ${judges
        .map((judge) => judge.summary.dimension_means[dimension])
        .join(" | ")} |`,
  ),
  "",
  "## Dimension agreement",
  "",
  "| Dimension | Exact | Within 1 | Total | Mean difference |",
  "|---|---:|---:|---:|---:|",
  ...dimensions.map(
    (dimension) =>
      `| ${dimension} | ${dimensionAgreement[dimension].exact} | ${dimensionAgreement[dimension].within_one} | ${dimensionAgreement[dimension].total} | ${dimensionAgreement[dimension].mean_abs_difference} |`,
  ),
  "",
  "## Per-output scores",
  "",
  "| Case | Repeat | " +
    judges.map((judge) => judge.model).join(" | ") +
    " | Difference |",
  "|---|---:|" + judges.map(() => "---:|").join("") + "---:|",
  ...cases.map(
    (item) =>
      `| ${item.case_id} | ${item.repeat_index} | ${item.means
        .map((value) => value ?? "error")
        .join(" | ")} | ${item.mean_abs_difference ?? "-"} |`,
  ),
  "",
  "## Flags",
  "",
  "| Judge | Flag | Count |",
  "|---|---|---:|",
  ...judges.flatMap((judge) =>
    Object.entries(judge.summary.flag_counts)
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => `| ${judge.model} | ${flag} | ${count} |`),
  ),
  "",
  "## Interpretation",
  "",
  "Absolute scores are not a release gate. Judge agreement and flag consistency are low.",
  "Use the panel for relative regression and defect discovery only.",
  "",
];
writeFileSync(join(dir, "aggregate-v3-panel.md"), lines.join("\n") + "\n");

console.log(
  JSON.stringify(
    {
      output: join(dir, "aggregate-v3-panel.json"),
      report: join(dir, "aggregate-v3-panel.md"),
      paired_outputs: summary.paired_outputs,
      mean_absolute_difference: summary.mean_absolute_difference,
      judges: summary.judges,
    },
    null,
    2,
  ),
);
