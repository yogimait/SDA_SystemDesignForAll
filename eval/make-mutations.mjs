import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HldModelSchema, LldDsaOutputSchema } from "@sda/contracts";
import {
  validateHldSection,
  validateLldDsaSection,
} from "../backend-server/dist/architecture/validator.js";
import {
  hldMustHaveIssues,
  mergedMustHaveIssues,
} from "../backend-server/dist/architecture/must-have-coverage.js";

const root = resolve(dirname(process.argv[1]), "..");
const datasetDir = join(root, "eval", "datasets", "sda-v1");
const structuralDir = join(root, "eval", "artifacts", "structural");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function latestGlmArchitectureArtifact() {
  const candidates = readdirSync(structuralDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(structuralDir, name))
    .filter((path) => {
      try {
        const first = JSON.parse(readFileSync(path, "utf8").split(/\r?\n/)[0]);
        return (
          first.model === "z-ai/glm-5.3-flash" &&
          first.stage_mode === "architecture"
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return candidates.at(-1);
}

const artifact = resolve(
  root,
  arg("--input", latestGlmArchitectureArtifact() ?? ""),
);
const outputDir = resolve(root, arg("--out-dir", "eval/artifacts/mutation"));
const inputPath = join(outputDir, "mutation-input.jsonl");
const keyPath = join(outputDir, "mutation-key.json");

if (!artifact) {
  throw new Error("No GLM architecture artifact found");
}

const dataset = readFileSync(join(datasetDir, "cases.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));
const cases = new Map(dataset.map((item) => [item.id, item]));
const records = readFileSync(artifact, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));

const caseIds = ["TC-URL-001", "TC-CHAT-003", "TC-AGENT-012"];
const bases = new Map();
for (const caseId of caseIds) {
  const record = records.find(
    (item) =>
      item.case_id === caseId &&
      item.repeat_index === 1 &&
      item.structural?.valid,
  );
  if (!record) {
    throw new Error(`No valid GLM architecture record for ${caseId}`);
  }
  bases.set(caseId, record);
}

function clone(value) {
  return structuredClone(value);
}

function component(hld, id) {
  return hld.components.find((item) => item.id === id);
}

function lldClass(section, id) {
  return section.lld.classes.find((item) => item.id === id);
}

function recommendation(section, id) {
  return section.dsa.recommendations.find((item) => item.id === id);
}

function mutateUrlCollision(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const store = lldClass(section, "cls_postgres_url_store");
  store.responsibility =
    "SQL implementation that inserts mappings without a unique constraint; duplicate short codes overwrite existing rows.";
  store.invariants = ["No unique constraint on the code column"];
  const insert = store.methods.find((method) => method.name === "insert");
  insert.description = "INSERT without uniqueness enforcement; may overwrite.";

  const service = lldClass(section, "cls_url_service");
  service.responsibility =
    "Create mappings by inserting the generated code directly; no collision detection or retry.";
  const create = service.methods.find(
    (method) => method.name === "createShortUrl",
  );
  create.description =
    "Inserts the first generated code; collisions are not checked or retried.";

  const hldStore = component(hld, "cmp_url_store");
  hldStore.responsibility =
    "Stores short-code mappings without a unique constraint; duplicate codes can overwrite.";
  return { hld, section };
}

function mutateUrlComplexity(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const lookup = recommendation(section, "dsa_cache_aside_lookup");
  lookup.dataStructure = "Unsorted relational table";
  lookup.algorithm =
    "On every redirect, scan the entire URL store table until the matching short code is found; the cache is not used.";
  lookup.complexity = {
    average: "O(1)",
    worst: "O(1)",
    notes: "Claims constant time; assumes the first scanned row is always the match.",
  };

  const cache = component(hld, "cmp_redirect_cache");
  cache.responsibility = "Configured but unused; redirects always scan the URL store.";
  return { hld, section };
}

function mutateChatTrace(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const flow = hld.flows.find((item) => item.id === "flow_send_message");
  flow.requirementRefs = ["fr_chat_history"];
  return { hld, section };
}

function mutateChatOrdering(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const sequence = recommendation(section, "dsa_seq_allocator");
  sequence.dataStructure = "Random UUID v4";
  sequence.algorithm =
    "Generate a random UUID for each message; do not allocate or persist a per-conversation sequence number.";
  sequence.complexity = {
    average: "O(1)",
    worst: "O(1)",
    notes: "No coordination; ordering is not preserved.",
  };
  sequence.rationale =
    "Avoids coordination by using random identifiers instead of per-conversation sequences.";

  const message = lldClass(section, "cls_message");
  message.responsibility =
    "Immutable message data: id, conversationId, senderId, body, timestamp. No per-conversation sequence number.";
  message.attributes = message.attributes.filter(
    (attribute) => attribute.name !== "sequenceNumber",
  );

  const store = component(hld, "cmp_message_store");
  store.responsibility =
    "Durable append-only storage of messages keyed by random message id; range queries by sequence are not available.";
  return { hld, section };
}

function mutateAgentPatternStuffing(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const classes = [
    ["cache", "unused-cache abstraction"],
    ["factory", "unused-factory abstraction"],
    ["observer", "unused-observer abstraction"],
    ["adapter", "unused-adapter abstraction"],
    ["strategy", "unused-strategy abstraction"],
    ["repository", "unused-repository abstraction"],
  ].map(([name, label]) => ({
    id: `cls_unused_${name}`,
    name: `Unused ${name}`,
    kind: "class",
    responsibility: `Unused ${label} reserved for future extensibility; no current caller or requirement.`,
    requirementRefs: [],
    rationale: "Added as a possible extension point, but nothing uses it.",
    alternatives: [],
    invariants: [],
    attributes: [],
    methods: [],
  }));
  section.lld.classes.push(...classes);

  section.lld.relationships.push(
    {
      id: "rel_unused_cache_factory",
      kind: "association",
      sourceId: "cls_unused_cache",
      targetId: "cls_unused_factory",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "unused wiring",
      rationale: "Unused extension wiring.",
    },
    {
      id: "rel_unused_observer_adapter",
      kind: "association",
      sourceId: "cls_unused_observer",
      targetId: "cls_unused_adapter",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "unused wiring",
      rationale: "Unused extension wiring.",
    },
    {
      id: "rel_unused_strategy_repository",
      kind: "association",
      sourceId: "cls_unused_strategy",
      targetId: "cls_unused_repository",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "unused wiring",
      rationale: "Unused extension wiring.",
    },
  );

  const patterns = [
    ["singleton", "Singleton", "creational", "cls_unused_cache"],
    ["decorator", "Decorator", "structural", "cls_unused_factory"],
    ["command", "Command", "behavioral", "cls_unused_observer"],
    ["bridge", "Bridge", "structural", "cls_unused_adapter"],
    ["visitor", "Visitor", "behavioral", "cls_unused_strategy"],
  ].map(([id, name, category, classId]) => ({
    id: `pat_unused_${id}`,
    name,
    category,
    participantClassIds: [classId],
    requirementRefs: [],
    rationale: "Unused abstraction added for future extensibility.",
    benefits: ["Could support a future extension."],
    drawbacks: ["Adds indirection without a current use case."],
    simplerAlternative: "Remove the abstraction until a real use case exists.",
    whenUnnecessary: "Always, while there is no caller or requirement.",
  }));
  section.lld.patterns.push(...patterns);
  return { hld, section };
}

function mutateAgentTenantLeak(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const sandbox = component(hld, "cmp_sandbox");
  sandbox.responsibility =
    "Execute a pinned agent version in a shared runner process with direct network egress; no per-run isolation or tenant boundary.";
  sandbox.scalingNotes =
    "Shared process reduces cost; one tenant can affect other tenants.";

  const runner = lldClass(section, "cls_sandboxed_runner");
  runner.responsibility =
    "Consumes jobs and executes agent code in a shared process with direct network egress; tenant boundaries are not enforced.";
  runner.rationale = "Simpler shared runtime.";
  return { hld, section };
}

const specs = [
  {
    label: "url_control_a",
    caseId: "TC-URL-001",
    variant: "control",
    defect: "Clean URL control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "url_control_b",
    caseId: "TC-URL-001",
    variant: "control",
    defect: "Clean URL control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "url_collision",
    caseId: "TC-URL-001",
    variant: "mutant",
    defect: "Removed collision handling and unique constraint",
    expectedFlags: ["missing_must_have"],
    targetDimensions: ["traceability", "lld_responsibility"],
    apply: mutateUrlCollision,
  },
  {
    label: "url_complexity",
    caseId: "TC-URL-001",
    variant: "mutant",
    defect: "Wrong complexity: full scan claimed as O(1)",
    expectedFlags: ["unsupported_complexity_claim"],
    targetDimensions: ["dsa_correctness"],
    apply: mutateUrlComplexity,
  },
  {
    label: "chat_control_a",
    caseId: "TC-CHAT-003",
    variant: "control",
    defect: "Clean chat control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "chat_control_b",
    caseId: "TC-CHAT-003",
    variant: "control",
    defect: "Clean chat control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "chat_wrong_trace",
    caseId: "TC-CHAT-003",
    variant: "mutant",
    defect: "Send flow mapped to history requirement",
    expectedFlags: ["contradicts_confirmed_requirements"],
    targetDimensions: ["traceability"],
    apply: mutateChatTrace,
  },
  {
    label: "chat_ordering",
    caseId: "TC-CHAT-003",
    variant: "mutant",
    defect: "Removed per-conversation ordering",
    expectedFlags: [
      "missing_must_have",
      "contradicts_confirmed_requirements",
    ],
    targetDimensions: ["dsa_correctness", "traceability"],
    apply: mutateChatOrdering,
  },
  {
    label: "agent_control_a",
    caseId: "TC-AGENT-012",
    variant: "control",
    defect: "Clean agent control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "agent_control_b",
    caseId: "TC-AGENT-012",
    variant: "control",
    defect: "Clean agent control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "agent_pattern_stuffing",
    caseId: "TC-AGENT-012",
    variant: "mutant",
    defect: "Added unused classes and patterns",
    expectedFlags: [],
    targetDimensions: ["simplicity"],
    apply: mutateAgentPatternStuffing,
  },
  {
    label: "agent_tenant_leak",
    caseId: "TC-AGENT-012",
    variant: "mutant",
    defect: "Removed sandbox tenant isolation",
    expectedFlags: [
      "unsafe_security_design",
      "contradicts_confirmed_requirements",
    ],
    targetDimensions: ["hld_boundaries", "lld_responsibility"],
    apply: mutateAgentTenantLeak,
  },
];

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
      clarifications: item.confirmed_requirements.clarifications.map(
        (question, index) => ({
          id: `q_${index + 1}`,
          question,
          answer: "",
        }),
      ),
    },
  };
}

function schemaIssues(error) {
  return error.issues.map((issue) => ({
    rule: "schema",
    path: issue.path.join("."),
    message: issue.message,
    severity: "error",
  }));
}

function issueSummary(issues) {
  return issues.map((issue) => ({
    rule: issue.rule,
    path: issue.path ?? null,
    message: issue.message,
    severity: issue.severity,
  }));
}

function validateVariant(caseItem, hld, section) {
  const confirmed = toConfirmed(caseItem);
  const hldSchema = HldModelSchema.safeParse(hld);
  const sectionSchema = LldDsaOutputSchema.safeParse(section);
  const hldValidation = hldSchema.success
    ? validateHldSection(hldSchema.data, confirmed)
    : { errors: [], warnings: [] };
  const sectionValidation = sectionSchema.success
    ? validateLldDsaSection(sectionSchema.data, hldSchema.data, confirmed)
    : { errors: [], warnings: [] };
  const hldCoverage = hldSchema.success
    ? hldMustHaveIssues(hldSchema.data, confirmed.spec)
    : [];
  const mergedCoverage =
    hldSchema.success && sectionSchema.success
      ? mergedMustHaveIssues(
          hldSchema.data,
          sectionSchema.data,
          confirmed.spec,
        )
      : [];

  const errors = [
    ...(hldSchema.success ? [] : schemaIssues(hldSchema.error)),
    ...(sectionSchema.success ? [] : schemaIssues(sectionSchema.error)),
    ...hldValidation.errors,
    ...sectionValidation.errors,
    ...hldCoverage,
    ...mergedCoverage,
  ];
  const warnings = [...hldValidation.warnings, ...sectionValidation.warnings];

  return {
    valid: errors.length === 0,
    errors: issueSummary(errors),
    warnings: issueSummary(warnings),
    must_have_issues: issueSummary([...hldCoverage, ...mergedCoverage]),
  };
}

function buildRecord(spec, order) {
  const base = bases.get(spec.caseId);
  const caseItem = cases.get(spec.caseId);
  if (!caseItem) {
    throw new Error(`Case missing from dataset: ${spec.caseId}`);
  }

  let hld;
  let section;
  if (spec.variant === "control") {
    hld = clone(base.raw.hld);
    section = clone(base.raw.lld_dsa);
  } else {
    const mutated = spec.apply({
      hld: clone(base.raw.hld),
      lld_dsa: clone(base.raw.lld_dsa),
    });
    hld = mutated.hld;
    section = mutated.section;
  }

  const structural = validateVariant(caseItem, hld, section);
  if (!structural.valid) {
    throw new Error(
      `${spec.label} is structurally invalid: ${JSON.stringify(
        structural.errors.slice(0, 5),
      )}`,
    );
  }

  const mutationId = `mut_${randomUUID().slice(0, 8)}`;
  return {
    record: {
      eval_run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      dataset_version: base.dataset_version,
      case_id: spec.caseId,
      split: base.split,
      domain: base.domain,
      complexity: base.complexity,
      repeat_index: 1,
      model: base.model,
      stage_mode: "mutation",
      mutation_id: mutationId,
      pricing: null,
      component_metrics: null,
      stages: {},
      structural,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost_usd: 0,
      duration_ms: 0,
      error: null,
      raw: { hld, lld_dsa: section },
    },
    key: {
      order,
      mutation_id: mutationId,
      label: spec.label,
      case_id: spec.caseId,
      variant: spec.variant,
      defect: spec.defect,
      expected_flags: spec.expectedFlags,
      target_dimensions: spec.targetDimensions,
    },
  };
}

const shuffled = [...specs].sort(() => Math.random() - 0.5);
const built = shuffled.map((spec, index) => buildRecord(spec, index + 1));
const inputRecords = built.map((item) => item.record);
const key = {
  generated_at: new Date().toISOString(),
  artifact,
  input: inputPath,
  records: built.map((item) => item.key),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  inputPath,
  inputRecords.map((record) => JSON.stringify(record)).join("\n") + "\n",
);
writeFileSync(keyPath, JSON.stringify(key, null, 2) + "\n");

for (const item of key.records) {
  const record = inputRecords.find(
    (entry) => entry.mutation_id === item.mutation_id,
  );
  console.log(
    `${item.mutation_id} ${item.case_id} ${item.variant.padEnd(7)} ${item.label} ` +
      `(errors=${record.structural.errors.length}, warnings=${record.structural.warnings.length})`,
  );
}

console.log(`\nInput: ${inputPath}`);
console.log(`Key:   ${keyPath}`);
