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

const batch = arg("--batch", "architecture-v1");
const batchCaseIds = {
  "architecture-v1": ["TC-URL-001", "TC-CHAT-003", "TC-AGENT-012"],
  "heldout-v1": [
    "TC-RATE-002",
    "TC-JOBS-006",
    "TC-PAY-005",
    "TC-FILES-007",
    "TC-SEARCH-008",
    "TC-SOCIAL-011",
  ],
};
if (!batchCaseIds[batch]) {
  throw new Error(`Unknown --batch: ${batch}`);
}

const artifact = resolve(
  root,
  arg("--input", latestGlmArchitectureArtifact() ?? ""),
);
const outputDir = resolve(
  root,
  arg(
    "--out-dir",
    batch === "architecture-v1"
      ? "eval/artifacts/mutation"
      : `eval/artifacts/mutation/${batch}`,
  ),
);
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

const caseIds = batchCaseIds[batch];
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

function mutateRateAtomicity(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const redis = component(hld, "cmp_redis");
  redis.responsibility =
    "Non-atomic counters: each instance reads the current value with GET, adds one, and writes it back with SET.";
  redis.scalingNotes =
    "Concurrent instances can overwrite each other's increments.";

  const lua = lldClass(section, "cls_RedisLuaScript");
  lua.responsibility =
    "Read-modify-write helper using GET then SET; no atomic script.";
  lua.rationale =
    "Simpler than Lua, but concurrent checks can lose increments.";

  const atomic = recommendation(section, "dsa_lua_script_execution");
  atomic.dataStructure = "Redis string counter";
  atomic.algorithm =
    "GET the current value, increment in application memory, then SET it back.";
  atomic.complexity = {
    average: "O(1)",
    worst: "O(1)",
    notes: "A single round trip per step, but not atomic.",
  };
  return { hld, section };
}

function mutateJobsAckBeforeWork(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const worker = component(hld, "cmp_worker");
  worker.responsibility =
    "Acknowledges each job as soon as it is claimed, before execution; failures are dropped and never retried.";

  const dlq = component(hld, "cmp_dlq");
  dlq.responsibility =
    "Configured but unused; exhausted or failed jobs are discarded.";

  const jobWorker = lldClass(section, "cls_job_worker");
  jobWorker.responsibility =
    "Marks a job done immediately on claim, then executes it; execution failure is ignored.";

  const deadLetter = lldClass(section, "cls_dead_letter_store");
  deadLetter.responsibility =
    "Unused; no job is ever written to the dead-letter table.";
  return { hld, section };
}

function mutatePaymentWebhook(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const ingress = component(hld, "cmp_webhook_ingress");
  ingress.responsibility =
    "Receives provider webhook payloads and enqueues them without signature verification; any caller can submit settlement events.";

  const flow = hld.flows.find((item) => item.id === "flow_reconcile");
  flow.description =
    "Process provider settlement webhooks without authenticating the sender.";
  return { hld, section };
}

function mutateFilesPublic(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const service = component(hld, "cmp_file_service");
  service.responsibility =
    "Returns presigned download URLs for any file ID without checking ownership or ACL.";

  const fileService = lldClass(section, "cls_FileService");
  fileService.responsibility =
    "Orchestrates uploads and returns download URLs for any file ID; no ownership check.";

  const objectStore = component(hld, "cmp_object_store");
  objectStore.responsibility =
    "Public bucket; every object is readable by key without signed access.";

  const s3 = lldClass(section, "cls_S3ObjectStore");
  s3.responsibility =
    "S3 adapter that serves public object URLs; no signed-URL enforcement.";
  return { hld, section };
}

function mutateSearchFullScan(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const suggest = component(hld, "cmp_suggest");
  suggest.responsibility =
    "Runs a SQL LIKE '%prefix%' full-table scan on every keystroke and returns all matching phrases without a result cap.";

  const prefix = lldClass(section, "cls_prefix_index");
  prefix.responsibility =
    "Loads all phrases from the relational table and linearly scans them per request; no prefix index.";

  const trie = recommendation(section, "dsa_trie_prefix");
  trie.dataStructure = "Relational phrase table";
  trie.algorithm =
    "SELECT phrases WHERE phrase LIKE '%' || prefix || '%'; no index and no result limit.";
  trie.complexity = {
    average: "O(N) full table scan per keystroke",
    worst: "O(N), where N is the entire phrase table",
    notes: "No prefix index and no result cap.",
  };
  return { hld, section };
}

function mutateSocialPublicMedia(base) {
  const hld = clone(base.hld);
  const section = clone(base.lld_dsa);

  const mediaStore = component(hld, "cmp_media_store");
  mediaStore.responsibility =
    "Public media bucket; serves any object key without signed URLs, authorization, or moderation checks.";

  const asset = lldClass(section, "cls_media_asset");
  asset.responsibility =
    "Public media reference: key, mime type, size, permanent public URL; no access control.";
  return { hld, section };
}

const architectureV1Specs = [
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

const heldoutV1Specs = [
  {
    label: "rate_control_a",
    caseId: "TC-RATE-002",
    variant: "control",
    defect: "Clean rate-limiter control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "rate_control_b",
    caseId: "TC-RATE-002",
    variant: "control",
    defect: "Clean rate-limiter control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "rate_atomicity",
    caseId: "TC-RATE-002",
    variant: "mutant",
    defect: "Replaced atomic counter update with GET/SET race",
    expectedFlags: [
      "missing_must_have",
      "contradicts_confirmed_requirements",
    ],
    targetDimensions: ["lld_responsibility", "dsa_correctness"],
    apply: mutateRateAtomicity,
  },
  {
    label: "jobs_control_a",
    caseId: "TC-JOBS-006",
    variant: "control",
    defect: "Clean job-queue control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "jobs_control_b",
    caseId: "TC-JOBS-006",
    variant: "control",
    defect: "Clean job-queue control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "jobs_ack_before_work",
    caseId: "TC-JOBS-006",
    variant: "mutant",
    defect: "Acknowledged jobs before execution and removed retries",
    expectedFlags: [
      "missing_must_have",
      "contradicts_confirmed_requirements",
    ],
    targetDimensions: ["hld_boundaries", "lld_responsibility"],
    apply: mutateJobsAckBeforeWork,
  },
  {
    label: "pay_control_a",
    caseId: "TC-PAY-005",
    variant: "control",
    defect: "Clean payment control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "pay_control_b",
    caseId: "TC-PAY-005",
    variant: "control",
    defect: "Clean payment control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "pay_webhook_unsigned",
    caseId: "TC-PAY-005",
    variant: "mutant",
    defect: "Removed webhook signature verification",
    expectedFlags: ["unsafe_security_design"],
    targetDimensions: ["hld_boundaries"],
    apply: mutatePaymentWebhook,
  },
  {
    label: "files_control_a",
    caseId: "TC-FILES-007",
    variant: "control",
    defect: "Clean file-service control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "files_control_b",
    caseId: "TC-FILES-007",
    variant: "control",
    defect: "Clean file-service control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "files_public",
    caseId: "TC-FILES-007",
    variant: "mutant",
    defect: "Made object storage public and removed ownership checks",
    expectedFlags: ["unsafe_security_design"],
    targetDimensions: ["hld_boundaries", "lld_responsibility"],
    apply: mutateFilesPublic,
  },
  {
    label: "search_control_a",
    caseId: "TC-SEARCH-008",
    variant: "control",
    defect: "Clean search control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "search_control_b",
    caseId: "TC-SEARCH-008",
    variant: "control",
    defect: "Clean search control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "search_full_scan",
    caseId: "TC-SEARCH-008",
    variant: "mutant",
    defect: "Replaced prefix index with full-table LIKE scan",
    expectedFlags: ["contradicts_confirmed_requirements"],
    targetDimensions: ["hld_boundaries", "dsa_correctness"],
    apply: mutateSearchFullScan,
  },
  {
    label: "social_control_a",
    caseId: "TC-SOCIAL-011",
    variant: "control",
    defect: "Clean social control",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "social_control_b",
    caseId: "TC-SOCIAL-011",
    variant: "control",
    defect: "Clean social control repeat",
    expectedFlags: [],
    targetDimensions: [],
  },
  {
    label: "social_public_media",
    caseId: "TC-SOCIAL-011",
    variant: "mutant",
    defect: "Made media public and removed authorization",
    expectedFlags: ["unsafe_security_design"],
    targetDimensions: ["hld_boundaries", "lld_responsibility"],
    apply: mutateSocialPublicMedia,
  },
];

const specs = {
  "architecture-v1": architectureV1Specs,
  "heldout-v1": heldoutV1Specs,
}[batch];

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
  batch,
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
