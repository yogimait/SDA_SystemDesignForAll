import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(process.argv[1]), "..");
const baselinePath = join(root, "eval", "baseline", "architecture-glm-v1.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const currentPath = join(
  root,
  "eval",
  "artifacts",
  "structural",
  "aggregate-learning.json",
);

const current = JSON.parse(readFileSync(currentPath, "utf8"));
const model = current.models?.find(
  (item) => item.model === baseline.generation.model,
);
if (!model) {
  console.error(`No current aggregate for ${baseline.generation.model}`);
  process.exit(1);
}

const expected = baseline.split_component_eval;
const checks = [];
function check(name, actual, pass, expectedValue) {
  checks.push({
    name,
    actual,
    expected: expectedValue,
    pass,
  });
}

check(
  "valid component runs",
  model.valid_runs,
  model.valid_runs >= expected.valid_runs,
  `>= ${expected.valid_runs}`,
);
check(
  "component pass@1",
  model.pass_at_1,
  model.pass_at_1 >= expected.pass_at_1,
  `>= ${expected.pass_at_1}`,
);
check(
  "cost per valid component run",
  model.cost_per_valid,
  model.cost_per_valid <= expected.cost_per_valid * 1.1,
  `<= ${(expected.cost_per_valid * 1.1).toFixed(6)}`,
);
check(
  "unresolved learning refs",
  model.component_averages?.learning?.unresolvedRefs,
  model.component_averages?.learning?.unresolvedRefs === 0,
  "0",
);

const failed = checks.filter((item) => !item.pass);
console.log(
  JSON.stringify(
    {
      baseline: baselinePath,
      current: currentPath,
      checks,
      pass: failed.length === 0,
    },
    null,
    2,
  ),
);
if (failed.length > 0) {
  process.exit(1);
}
