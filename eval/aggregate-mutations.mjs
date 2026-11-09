import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(process.argv[1]), "..");
const mutationDir = resolve(
  root,
  process.argv.includes("--dir")
    ? process.argv[process.argv.indexOf("--dir") + 1]
    : "eval/artifacts/mutation",
);
const keyPath = join(mutationDir, "mutation-key.json");
const reportJsonPath = join(mutationDir, "mutation-report.json");
const reportMdPath = join(mutationDir, "mutation-report.md");

const SCORE_KEYS = [
  "traceability",
  "hld_boundaries",
  "lld_responsibility",
  "dsa_correctness",
  "simplicity",
  "pedagogical_quality",
  "learning_quality",
  "interview_usefulness",
];

if (!existsSync(keyPath)) {
  throw new Error(`Mutation key missing: ${keyPath}`);
}

const key = JSON.parse(readFileSync(keyPath, "utf8"));
const keyById = new Map(key.records.map((item) => [item.mutation_id, item]));
const judgeFiles = readdirSync(mutationDir)
  .filter((name) => /^judge-.*\.jsonl$/.test(name))
  .sort();
if (judgeFiles.length === 0) {
  throw new Error(`No judge-*.jsonl files in ${mutationDir}`);
}

function mean(values) {
  return values.length === 0
    ? null
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

function flagName(flag) {
  if (typeof flag === "string") {
    return flag.split(":")[0].trim();
  }
  if (flag && typeof flag === "object") {
    return String(flag.code ?? flag.type ?? JSON.stringify(flag));
  }
  return String(flag);
}

function flagsOf(result) {
  return [...new Set((result?.hard_flags ?? []).map(flagName))];
}

function scoreRow(result) {
  return result?.status === "scored" && result.scores ? result.scores : null;
}

function controlRows(caseId, rows) {
  return key.records
    .filter((item) => item.case_id === caseId && item.variant === "control")
    .map((item) => rows.get(item.mutation_id))
    .filter((item) => scoreRow(item));
}

function controlAverage(caseId, rows) {
  const controls = controlRows(caseId, rows);
  if (controls.length === 0) return null;
  return Object.fromEntries(
    SCORE_KEYS.map((dimension) => [
      dimension,
      mean(controls.map((item) => item.scores[dimension])),
    ]),
  );
}

function controlConsistency(caseId, rows) {
  const controls = controlRows(caseId, rows);
  if (controls.length < 2) return null;
  const diffs = controls.flatMap((item, index) =>
    controls.slice(index + 1).flatMap((other) =>
      SCORE_KEYS.map((dimension) =>
        Math.abs(item.scores[dimension] - other.scores[dimension]),
      ),
    ),
  );
  return {
    pairs: controls.length * (controls.length - 1) / 2,
    mean_abs_difference: mean(diffs),
    exact_dimensions: diffs.filter((value) => value === 0).length,
    total_dimensions: diffs.length,
  };
}

function controlFlags(caseId, rows) {
  return [
    ...new Set(
      controlRows(caseId, rows).flatMap((item) => flagsOf(item)),
    ),
  ];
}

function controlFlagStability(caseId, rows) {
  const controls = controlRows(caseId, rows);
  if (controls.length < 2) return null;
  const first = new Set(flagsOf(controls[0]));
  const second = new Set(flagsOf(controls[1]));
  const onlyFirst = [...first].filter((flag) => !second.has(flag));
  const onlySecond = [...second].filter((flag) => !first.has(flag));
  return {
    stable: onlyFirst.length === 0 && onlySecond.length === 0,
    only_first: onlyFirst,
    only_second: onlySecond,
  };
}

function judgeResults(path) {
  const file = join(mutationDir, path);
  const rows = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const byId = new Map(rows.map((row) => [row.mutation_id, row]));
  const model = [...new Set(rows.map((row) => row.judge_model))].join(", ");
  return { path, file, rows, byId, model };
}

function evaluateJudge(judge) {
  const controls = key.records
    .filter((item) => item.variant === "control")
    .map((item) => {
      const result = judge.byId.get(item.mutation_id);
      return {
        mutation_id: item.mutation_id,
        label: item.label,
        case_id: item.case_id,
        status: result?.status ?? "missing",
        mean: result?.mean ?? null,
        hard_flags: flagsOf(result),
        scores: scoreRow(result),
      };
    });

  const mutants = key.records
    .filter((item) => item.variant === "mutant")
    .map((item) => {
      const result = judge.byId.get(item.mutation_id);
      const baseline = controlAverage(item.case_id, judge.byId);
      const scores = scoreRow(result);
      if (!baseline || !scores) {
        return {
          mutation_id: item.mutation_id,
          label: item.label,
          case_id: item.case_id,
          defect: item.defect,
          status: result?.status ?? "missing",
          detected: false,
          target_hit: false,
          flag_hit: false,
          mean: result?.mean ?? null,
          target_deltas: {},
          unrelated_mean_drop: null,
          baseline_flags: controlFlags(item.case_id, judge.byId),
          new_flags: [],
          hard_flags: flagsOf(result),
          rationale: result?.rationale ?? null,
        };
      }

      const deltas = Object.fromEntries(
        SCORE_KEYS.map((dimension) => [
          dimension,
          Math.round((baseline[dimension] - scores[dimension]) * 1000) / 1000,
        ]),
      );
      const targetHit = item.target_dimensions.some(
        (dimension) => deltas[dimension] >= 1,
      );
      const flags = flagsOf(result);
      const baselineFlags = controlFlags(item.case_id, judge.byId);
      const newFlags = flags.filter((flag) => !baselineFlags.includes(flag));
      const flagHit = item.expected_flags.some((flag) => newFlags.includes(flag));
      const unrelated = SCORE_KEYS.filter(
        (dimension) => !item.target_dimensions.includes(dimension),
      );
      return {
        mutation_id: item.mutation_id,
        label: item.label,
        case_id: item.case_id,
        defect: item.defect,
        status: result.status,
        detected: targetHit || flagHit,
        target_hit: targetHit,
        flag_hit: flagHit,
        mean: result.mean,
        target_deltas: Object.fromEntries(
          item.target_dimensions.map((dimension) => [dimension, deltas[dimension]]),
        ),
        unrelated_mean_drop: mean(unrelated.map((dimension) => deltas[dimension])),
        baseline_flags: baselineFlags,
        new_flags: newFlags,
        hard_flags: flags,
        rationale: result.rationale ?? null,
      };
    });

  const byCase = Object.fromEntries(
    [...new Set(key.records.map((item) => item.case_id))].map((caseId) => [
      caseId,
      {
        control_consistency: controlConsistency(caseId, judge.byId),
        control_flags: controlFlags(caseId, judge.byId),
        control_flag_stability: controlFlagStability(caseId, judge.byId),
        control_average: controlAverage(caseId, judge.byId),
      },
    ]),
  );

  return {
    model: judge.model,
    path: judge.file,
    controls,
    by_case: byCase,
    mutants,
    summary: {
      mutants: mutants.length,
      scored: mutants.filter((item) => item.status === "scored").length,
      detected: mutants.filter((item) => item.detected).length,
      target_hits: mutants.filter((item) => item.target_hit).length,
      flag_hits: mutants.filter((item) => item.flag_hit).length,
      errored: mutants.filter((item) => item.status !== "scored").length,
      control_flags: Object.values(byCase).flatMap((item) => item.control_flags),
      control_inconsistency: Object.values(byCase)
        .map((item) => item.control_consistency?.mean_abs_difference)
        .filter((value) => value !== null && value !== undefined),
    },
  };
}

const judges = judgeFiles.map((file) =>
  evaluateJudge(judgeResults(file)),
);
const comparison = key.records
  .filter((item) => item.variant === "mutant")
  .map((item) => ({
    mutation_id: item.mutation_id,
    label: item.label,
    case_id: item.case_id,
    defect: item.defect,
    detected_by: judges
      .filter((judge) =>
        judge.mutants.find((mutant) => mutant.mutation_id === item.mutation_id)?.detected,
      )
      .map((judge) => judge.model),
  }));

const atLeastOne = comparison.filter((item) => item.detected_by.length >= 1).length;
const both = comparison.filter((item) => item.detected_by.length === judges.length).length;
const baselineFlags = judges.flatMap((judge) =>
  Object.values(judge.by_case).flatMap((item) => item.control_flags),
);
const controlFlagIssues = judges.flatMap((judge) =>
  Object.entries(judge.by_case)
    .filter(([, item]) => item.control_flag_stability?.stable === false)
    .map(([caseId, item]) => ({
      judge: judge.model,
      case_id: caseId,
      only_first: item.control_flag_stability.only_first,
      only_second: item.control_flag_stability.only_second,
    })),
);
const controlNoise = judges.flatMap((judge) =>
  Object.values(judge.by_case)
    .map((item) => item.control_consistency?.mean_abs_difference)
    .filter((value) => value !== null && value !== undefined),
);
const unrelatedDrops = judges.flatMap((judge) =>
  judge.mutants
    .map((item) => item.unrelated_mean_drop)
    .filter((value) => value !== null),
);

const gate = {
  at_least_one: {
    value: atLeastOne,
    total: comparison.length,
    pass: atLeastOne >= 5,
  },
  both_judges: {
    value: both,
    total: comparison.length,
    pass: both >= 4,
  },
  control_flag_stability: {
    value: controlFlagIssues,
    pass: controlFlagIssues.length === 0,
  },
  control_noise: {
    max_mean_abs_difference: controlNoise.length ? Math.max(...controlNoise) : null,
    pass: controlNoise.every((value) => value <= 0.5),
  },
  unrelated_drop: {
    max_mean_abs_difference: unrelatedDrops.length ? Math.max(...unrelatedDrops) : null,
    pass: unrelatedDrops.every((value) => value <= 0.5),
  },
};
gate.overall_pass =
  gate.at_least_one.pass &&
  gate.both_judges.pass &&
  gate.control_flag_stability.pass &&
  gate.control_noise.pass &&
  gate.unrelated_drop.pass;
gate.baseline_flags = [...new Set(baselineFlags)];

const report = {
  generated_at: new Date().toISOString(),
  key: keyPath,
  judges: judges.map((judge) => ({
    model: judge.model,
    path: judge.path,
    controls: judge.controls,
    by_case: judge.by_case,
    mutants: judge.mutants,
    summary: judge.summary,
  })),
  comparison,
  gate,
};
writeFileSync(reportJsonPath, JSON.stringify(report, null, 2) + "\n");

const lines = [
  "# Architecture Mutation Test",
  "",
  `Generated: ${report.generated_at}`,
  "",
  "## Gate",
  "",
  "| Check | Result | Pass |",
  "|---|---:|---|",
  `| At least one judge detects | ${gate.at_least_one.value}/${gate.at_least_one.total} | ${gate.at_least_one.pass} |`,
  `| Both judges detect | ${gate.both_judges.value}/${gate.both_judges.total} | ${gate.both_judges.pass} |`,
  `| Control flag stability | ${gate.control_flag_stability.value.length === 0 ? "stable" : `${gate.control_flag_stability.value.length} inconsistent case(s)`} | ${gate.control_flag_stability.pass} |`,
  `| Control test-retest noise | ${gate.control_noise.max_mean_abs_difference ?? "n/a"} | ${gate.control_noise.pass} |`,
  `| Unrelated dimension drop | ${gate.unrelated_drop.max_mean_abs_difference ?? "n/a"} | ${gate.unrelated_drop.pass} |`,
  `| Overall | | ${gate.overall_pass} |`,
  "",
  `Baseline flags on controls: ${gate.baseline_flags.join(", ") || "none"}.`,
  "",
  "## Judge results",
  "",
];

for (const judge of judges) {
  lines.push(
    `### ${judge.model}`,
    "",
    `Detected ${judge.summary.detected}/${judge.summary.mutants}; target dimension hit ${judge.summary.target_hits}/${judge.summary.mutants}; hard-flag hit ${judge.summary.flag_hits}/${judge.summary.mutants}.`,
    "",
    "| Case | Mutation | Detected | Target drop | New flags |",
    "|---|---|---:|---|---|",
  );
  for (const mutant of judge.mutants) {
    lines.push(
      `| ${mutant.case_id} | ${mutant.defect} | ${mutant.detected ? "yes" : "no"} | ${JSON.stringify(mutant.target_deltas)} | ${mutant.new_flags.join(", ") || "-"} |`,
    );
  }
  lines.push("");
}

lines.push(
  "## Cross-judge detection",
  "",
  "| Case | Mutation | Detected by |",
  "|---|---|---|",
);
for (const item of comparison) {
  lines.push(
    `| ${item.case_id} | ${item.defect} | ${item.detected_by.join(", ") || "none"} |`,
  );
}
lines.push("");
lines.push("## Missed mutants");
lines.push("");
for (const judge of judges) {
  const missed = judge.mutants.filter((mutant) => !mutant.detected);
  if (missed.length === 0) {
    lines.push(`- **${judge.model}**: none`);
    continue;
  }
  for (const mutant of missed) {
    const rationale = (mutant.rationale ?? "no rationale").slice(0, 500);
    lines.push(
      `- **${judge.model} / ${mutant.defect}**: ${rationale}`,
    );
  }
}
lines.push("");
writeFileSync(reportMdPath, lines.join("\n") + "\n");

console.log(JSON.stringify({ reportJsonPath, reportMdPath, gate }, null, 2));
