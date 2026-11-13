import type {
  DsaModel,
  HldModel,
  LldModel,
  RequirementsSpec,
  ValidationIssue,
} from "@sda/contracts";

/**
 * Cross-cutting requirement/architecture consistency warnings. They never
 * block persistence: a valid diagram that contradicts its own requirements is
 * still worth showing, but the contradiction must be visible.
 */
export interface ConsistencyInput {
  spec: RequirementsSpec;
  hld?: HldModel;
  lld?: LldModel;
  dsa?: DsaModel;
}

const LOCAL_ONLY_TERMS =
  /\bfully local\b|\blocal[- ]only\b|\bair[- ]?gapped\b|\bno (?:task |user |customer )?data leaves the (?:device|machine|laptop)\b|\bno external (?:calls|requests|services)\b|\bno data is sent\b/i;

const EXTERNAL_MARKERS =
  /\b(cloud|openai|openrouter|groq|anthropic|gemini|aws|azure|gcp|google cloud|bedrock|vertex|stripe|third[- ]party|vendor|remote api|external (?:service|api|model|llm)|hosted (?:model|llm|api)|saas)\b/i;

/**
 * Execution is only in scope when an execution verb has a real object (code,
 * tools, commands, scripts, tests, tasks) or an explicit execution phrase is
 * used. Bare "execution" (query execution) and bare "agent" are too broad.
 */
const EXECUTION_OBJECTS =
  "code|tool|tools|command|commands|script|scripts|test|tests|task|tasks";

const EXECUTION_TERMS = new RegExp(
  [
    `\\bexecut\\w*\\b[^.\\n]{0,40}\\b(?:${EXECUTION_OBJECTS})\\b`,
    `\\b(?:run|runs|running|invoke|invokes|invoking)\\b\\s+(?:the\\s+)?(?:\\w+\\s+)?(?:${EXECUTION_OBJECTS})\\b`,
    "\\bcode execution\\b",
    "\\btool execution\\b",
    "\\bagent runtime\\b",
    "\\bexecutes? (?:the )?tools?\\b",
    "\\bruns? (?:the )?commands?\\b",
    "\\bsandbox(?:ed|ing)?\\b",
  ].join("|"),
  "i",
);

const OUT_OF_SCOPE_TERMS =
  /\bout of scope\b|\bnot in scope\b|\bexcluded\b|\bnot (?:included|covered|supported|implemented)\b|\bno (?:actual )?(?:code )?execution\b|\bwithout executing\b|\bnot executed\b|\b(?:will not|does not|won't|doesn't) (?:execute|run)\b/i;

/**
 * Only strong execution boundaries count. Generic access control, permissions,
 * and audit are properties of ordinary applications, not evidence that an
 * execution runtime is contained.
 */
const RUNTIME_BOUNDARY_TERMS =
  /\b(?:sandbox|sandboxed|isolation|isolated)\b|\btool[ _-]?permissions?\b|\bsecret[ _-]?(?:broker|management)\b|\bcredential[ _-]?broker\b|\bapproval[ _-]?gate\b|\bapproval for destructive\b|\bruntime[ _-]?adapter\b|\baudit[ _-]?(?:trail|log)\b/i;

function hldText(hld: HldModel): string {
  return [
    ...hld.components.flatMap((item) => [
      item.name,
      item.type,
      item.responsibility,
      item.technology,
      item.scalingNotes,
    ]),
    ...hld.connections.flatMap((item) => [
      item.label,
      item.protocol,
      item.rationale,
    ]),
    ...hld.flows.flatMap((item) => [
      item.name,
      item.description,
      ...item.steps.map((step) => step.description),
    ]),
    ...hld.technologyDecisions.flatMap((item) => [
      item.topic,
      item.choice,
      item.why,
      item.limits,
    ]),
    ...hld.scalabilityNotes.flatMap((item) => [
      item.aspect,
      item.approach,
      item.limits,
    ]),
    ...hld.failureScenarios.flatMap((item) => [
      item.condition,
      item.impact,
      item.mitigation,
      item.tradeOff,
    ]),
  ].join("\n");
}

function lldText(lld: LldModel): string {
  return [
    ...lld.classes.flatMap((item) => [
      item.name,
      item.responsibility,
      item.rationale,
      ...item.invariants,
      ...item.attributes.map((attribute) => attribute.name),
      ...item.methods.map((method) => `${method.name} ${method.signature}`),
    ]),
    ...lld.relationships.map((item) => `${item.label} ${item.rationale}`),
    ...lld.patterns.flatMap((item) => [
      item.name,
      item.rationale,
      ...item.benefits,
      ...item.drawbacks,
    ]),
  ].join("\n");
}

function referencedRequirementIds(input: ConsistencyInput): Set<string> {
  const referenced = new Set<string>();
  const add = (refs: string[] | undefined): void => {
    for (const ref of refs ?? []) {
      referenced.add(ref);
    }
  };
  for (const item of input.hld?.components ?? []) add(item.requirementRefs);
  for (const item of input.hld?.flows ?? []) add(item.requirementRefs);
  for (const item of input.lld?.classes ?? []) add(item.requirementRefs);
  for (const item of input.lld?.patterns ?? []) add(item.requirementRefs);
  for (const item of input.dsa?.recommendations ?? []) add(item.requirementRefs);
  return referenced;
}

function securityNfrIssues(input: ConsistencyInput): ValidationIssue[] {
  // Security NFRs are mapped at the HLD level, so a section without the HLD
  // cannot judge coverage without false positives.
  if (!input.hld) return [];
  const referenced = referencedRequirementIds(input);

  return input.spec.nonFunctional
    .filter(
      (item) =>
        item.priority === "must" &&
        item.category === "security" &&
        !referenced.has(item.id),
    )
    .map((item) => ({
      rule: "security_nfr_uncovered",
      severity: "warning" as const,
      message: `Security non-functional requirement "${item.text}" is not referenced by any component, flow, class, pattern, or DSA recommendation. Map it to the element that enforces it.`,
      path: `requirements.nonFunctional(${item.id})`,
    }));
}

function localOnlyIssues(input: ConsistencyInput): ValidationIssue[] {
  if (!input.hld) return [];
  const localOnly = input.spec.nonFunctional.filter((item) =>
    LOCAL_ONLY_TERMS.test(`${item.text} ${item.target}`),
  );
  if (localOnly.length === 0) return [];

  const dependencies: string[] = [];
  for (const component of input.hld.components) {
    if (
      component.type === "external" ||
      EXTERNAL_MARKERS.test(
        `${component.name} ${component.technology} ${component.responsibility}`,
      )
    ) {
      dependencies.push(component.name);
    }
  }
  for (const connection of input.hld.connections) {
    if (
      EXTERNAL_MARKERS.test(
        `${connection.label} ${connection.protocol} ${connection.rationale}`,
      )
    ) {
      dependencies.push(`connection "${connection.label}"`);
    }
  }
  if (dependencies.length === 0) return [];

  return localOnly.map((item) => ({
    rule: "local_only_conflict",
    severity: "warning" as const,
    message: `Local-only requirement "${item.text}" conflicts with external dependency: ${dependencies.join(", ")}.`,
    path: "hld.components",
  }));
}

function executionBoundaryIssues(input: ConsistencyInput): ValidationIssue[] {
  const sections = [
    input.hld ? hldText(input.hld) : "",
    input.lld ? lldText(input.lld) : "",
  ].join("\n");
  if (sections.trim().length === 0) return [];
  if (!mentionsExecution(input.spec)) return [];
  if (RUNTIME_BOUNDARY_TERMS.test(sections)) return [];

  return [
    {
      rule: "execution_boundary_missing",
      severity: "warning",
      message:
        "Execution is in scope, but no element defines a runtime boundary (sandbox, isolation, tool permissions, secret or credential broker, runtime adapter, audit trail, approval for destructive actions).",
      path: input.hld ? "hld.components" : "lld.classes",
    },
  ];
}

function executionScopeIssues(spec: RequirementsSpec): ValidationIssue[] {
  if (!mentionsExecution(spec)) return [];

  return spec.assumptions
    .filter(
      (item) =>
        OUT_OF_SCOPE_TERMS.test(item.text) && EXECUTION_TERMS.test(item.text),
    )
    .map((item) => ({
      rule: "execution_scope_conflict",
      severity: "warning" as const,
      message: `Assumption "${item.text}" excludes execution, but the requirements or clarification answers describe executing, running, or testing code or tasks.`,
      path: `requirements.assumptions(${item.id})`,
    }));
}

function mentionsExecution(spec: RequirementsSpec): boolean {
  const inStatements = [...spec.functional, ...spec.nonFunctional].some(
    (item) =>
      EXECUTION_TERMS.test(
        `${item.text} ${"target" in item ? item.target : ""}`,
      ),
  );
  if (inStatements) return true;

  // Clarification questions often raise execution hypothetically. Only an
  // answer that affirms execution counts, and an answer that itself puts
  // execution out of scope is not evidence that it is in scope.
  return spec.clarifications.some(
    (item) =>
      item.answer !== undefined &&
      EXECUTION_TERMS.test(item.answer) &&
      !OUT_OF_SCOPE_TERMS.test(item.answer),
  );
}

export function consistencyWarnings(
  input: ConsistencyInput,
): ValidationIssue[] {
  return [
    ...securityNfrIssues(input),
    ...localOnlyIssues(input),
    ...executionBoundaryIssues(input),
    ...executionScopeIssues(input.spec),
  ];
}
