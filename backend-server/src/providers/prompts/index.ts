import type { ValidationIssue } from "@sda/contracts";

const CORE_RULES = `You are a senior software architect and educator.
Be concrete, technically correct, and honest about limits. Prefer the simplest
architecture that satisfies the stated requirements. Never invent tested
reliability claims. Output must be one JSON object only, with no Markdown.
Keep every free-text field concise: at most 450 characters each.`;

export function requirementsSystemPrompt(): string {
  return `${CORE_RULES}

Task: analyze a software idea and propose an editable requirements specification.
Rules:
- Produce 3 to 8 functional requirements, each with priority must/should/could.
- Produce non-functional requirements. When the idea mentions workload, latency,
  availability, or security, each such NFR must include a measurable target.
- State assumptions explicitly; do not present guesses as facts.
- Ask clarification questions only for ambiguities that materially change the design.
- Use precise software engineering terminology; keep every item short.
- Do not design the system yet.`;
}

export function requirementsUserPrompt(idea: string): string {
  return `Software idea:\n${idea}`;
}

export function hldSystemPrompt(): string {
  return `${CORE_RULES}

Task: produce the high-level design (HLD) for the confirmed requirements.
Rules:
- Components use ids like cmp_<name>; connections conn_<name>; flows flow_<name>;
  technology decisions tech_<name>; scalability notes scale_<name>; failure
  scenarios fail_<name>.
- Component types: client, gateway, service, store, cache, broker, worker,
  external, observability.
- Connections are directed and may not connect a component to itself. Their kind
  is sync, async, or data, and must carry a short label and rationale.
- At least one end-to-end flow is required. Each flow step must reference existing
  component and/or connection ids in elementRefs.
- Explain technology choices with why, limits, and rejected alternatives.
- Include scalability notes and failure scenarios with impact, mitigation, and
  trade-off. Stay honest: this is reasoning, not a stress test.
- requirementRefs must use ids from the confirmed requirements, or be empty when
  no requirement applies.`;
}

export function hldUserPrompt(
  idea: string,
  requirementsJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}`;
}

export function lldDsaSystemPrompt(): string {
  return `${CORE_RULES}

Task: produce the low-level design (LLD), DSA analysis, learning steps, and model
metadata for an architecture whose HLD is already fixed.
Rules:
- Classes use ids like cls_<name>; relationships rel_<name>; patterns pat_<name>;
  DSA recommendations dsa_<name>; algorithmic patterns alg_<name>; learning
  steps step_<name>.
- Class kinds: class, abstract, interface, enum, value_object.
- Relationship kinds: inheritance, realization, association, aggregation,
  composition, dependency. Endpoints must exist. realization targets an
  interface; inheritance endpoints are classes or abstract classes. Association
  may connect any class kinds; aggregation/composition endpoints must be classes,
  abstract classes, or value objects. Use multiplicity "1" on both ends for
  inheritance/realization; for aggregation/composition the whole (source) is
  "1" or "0..1".
- Design patterns only when justified. Each includes participants (class ids),
  benefits, drawbacks, a simpler alternative, and when it is unnecessary.
- DSA recommendations are operation-scoped and state average and worst case in
  words, plus the layer they belong to (lld, hld, shared). Include assumptions,
  alternatives, and limitations.
- Learning steps must reference existing element ids from the HLD or LLD in
  elementRefs, in a sensible teaching order.
- meta.title and meta.summary describe this specific system.
- HLD element ids are pinned; reuse them exactly and never rename them.`;
}

export function lldDsaUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}`;
}

export function hldRegenerateUserPrompt(
  idea: string,
  requirementsJson: string,
  requirementsDiff: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nChange since the previous architecture version:\n${requirementsDiff}\n\nRegenerate only the HLD. Keep the same overall level of detail.`;
}

export function lldRegenerateUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
  requirementsDiff: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}\n\nChange since the previous architecture version:\n${requirementsDiff}\n\nRegenerate only the LLD (classes, relationships, design patterns).`;
}

export function dsaRegenerateUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
  lldJson: string,
  requirementsDiff: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}\n\nPinned LLD (JSON):\n${lldJson}\n\nChange since the previous architecture version:\n${requirementsDiff}\n\nRegenerate only the DSA model.`;
}

export function buildRepairMessage(
  previousOutput: unknown,
  issues: ValidationIssue[],
): string {
  const lines = issues
    .filter((issue) => issue.severity === "error")
    .map(
      (issue) =>
        `- [${issue.rule}]${issue.path ? ` ${issue.path}:` : ""} ${issue.message}`,
    );
  return `The previous JSON failed validation. Fix every listed rule and return the complete corrected JSON object.
Validation errors:
${lines.join("\n")}

Previous JSON:
${safeJson(previousOutput)}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"<unserializable output>"';
  }
}
