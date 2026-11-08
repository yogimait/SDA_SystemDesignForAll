import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const structuralDir = join(root, "eval", "artifacts", "structural");
const judgeDir = join(root, "eval", "artifacts", "judge");
const outDir = join(root, "eval", "artifacts", "calibration", "architecture-glm-v1");

const selected = new Set([
  "TC-URL-001",
  "TC-CHAT-003",
  "TC-EDITOR-009",
  "TC-OBS-010",
  "TC-AGENT-012",
]);

const casesPath = join(root, "eval", "datasets", "sda-v1", "cases.jsonl");
const cases = new Map(
  readFileSync(casesPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((item) => [item.id, item]),
);

const architectureFile = readdirSync(structuralDir)
  .filter((name) => name.endsWith(".jsonl") && name.includes("z_ai_glm_5_3_flash"))
  .map((name) => ({ name, path: join(structuralDir, name) }))
  .filter(({ path }) => {
    try {
      const first = JSON.parse(readFileSync(path, "utf8").split(/\r?\n/)[0]);
      return first.model === "z-ai/glm-5.3-flash" && first.stage_mode === "architecture";
    } catch {
      return false;
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
  .at(-1);
if (!architectureFile) throw new Error("No GLM architecture artifact");

const judgeFile = readdirSync(judgeDir)
  .filter((name) => /^architecture-glm-.*\.jsonl$/.test(name))
  .sort()
  .at(-1);
if (!judgeFile) throw new Error("No judge artifact");

const architecture = readFileSync(architectureFile.path, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const judge = readFileSync(join(judgeDir, judgeFile), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const samples = [];
const key = [];
for (const caseId of selected) {
  const record = architecture.find(
    (entry) => entry.case_id === caseId && entry.repeat_index === 1,
  );
  const judged = judge.find(
    (entry) => entry.case_id === caseId && entry.repeat_index === 1,
  );
  if (!record || !judged) continue;
  const caseItem = cases.get(caseId);
  samples.push({
    case_id: caseId,
    repeat_index: 1,
    case: caseItem
      ? {
          idea: caseItem.idea,
          domain: caseItem.domain,
          complexity: caseItem.complexity,
          confirmed_requirements: caseItem.confirmed_requirements,
          must_have_behaviors: caseItem.must_have_behaviors,
          acceptable_alternatives: caseItem.acceptable_alternatives,
          anti_patterns: caseItem.anti_patterns,
          reference_notes: caseItem.reference_notes,
        }
      : null,
    structural: record.structural,
    hld: record.raw?.hld,
    lld: record.raw?.lld_dsa?.lld,
    dsa: record.raw?.lld_dsa?.dsa,
    learningSteps: record.raw?.lld_dsa?.learningSteps,
  });
  key.push({
    case_id: caseId,
    repeat_index: 1,
    judge_model: judged.judge_model,
    scores: judged.scores,
    mean: judged.mean,
    hard_flags: judged.hard_flags,
    rationale: judged.rationale,
    evidence: judged.evidence,
  });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "samples.json"), JSON.stringify(samples, null, 2));
writeFileSync(join(outDir, "judge-key.json"), JSON.stringify(key, null, 2));

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
const header = ["case_id", "repeat_index", ...dimensions, "notes"].join(",");
const rows = samples.map((sample) => [sample.case_id, sample.repeat_index, ...dimensions.map(() => ""), ""].join(","));
writeFileSync(join(outDir, "human-scores.csv"), `${header}\n${rows.join("\n")}\n`);

const readme = `# Human calibration — GLM architecture v1

Blind scoring. Do not open judge-key.json until human-scores.csv is complete.

## Files

- samples.json — five architecture outputs, no judge scores
- human-scores.csv — fill each dimension with 1–5
- judge-key.json — judge scores and rationales; open only after scoring

## Rubric

Use eval/datasets/sda-v1/rubrics/architecture-v1.md.

Score each dimension from 1 to 5:

${dimensions.map((dimension) => `- ${dimension}`).join("\n")}

Do not compare against one exact architecture. Judge requirements, boundaries,
responsibility, DSA honesty, simplicity, learning quality, and interview value.

## Why five

Five records is 20% of the 24 GLM architecture outputs.

## After scoring

Compare each human score with judge-key.json. Report:
- agreement per dimension
- weighted kappa or exact agreement
- disagreements of 2 or more points
- whether the hard flags are valid

If agreement is below 0.60, revise the rubric or judge prompt before trusting
the semantic baseline.
`;
writeFileSync(join(outDir, "README.md"), readme);
console.log(JSON.stringify({ outDir, samples: samples.length, architecture: architectureFile.name, judge: judgeFile }, null, 2));
