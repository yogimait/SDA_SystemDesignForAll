import type { ValidationIssue } from "@sda/contracts";

const CORE_RULES = `You are a senior software architect and educator.
Be concrete, technically correct, and honest about limits. Prefer the simplest
architecture that satisfies the stated requirements. Never invent tested
reliability claims. Output must be one JSON object only, with no Markdown.
Keep every free-text field concise: at most 450 characters each.`;

const DESIGN_PATTERN_CATALOG = `Candidate design-pattern catalog (not a checklist):
- Creational: Singleton; Simple Factory; Factory Method; Abstract Factory;
  Classic Builder; Step Builder; Builder with Director; Prototype.
- Structural: Object Adapter; Class Adapter; Bridge; Composite; Decorator;
  Facade; Flyweight; Virtual Proxy; Protection Proxy; Remote Proxy.
- Behavioral: Chain of Responsibility; Command; Iterator; Mediator; Memento;
  Observer; State; Strategy; Template Method; Visitor.
- Special idiom: Null Object (use category "behavioral").
Choose only patterns that solve a real problem in this design. Prefer 2-5
justified patterns; never add a pattern just to cover the catalog. Pattern
participants must be connected by relationships that express the pattern
(for example realization to an interface, or association/aggregation to a
collaborator).`;

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
- Aim for 6-12 components, 8-16 connections, and 1-2 end-to-end flows.
  Completeness and readability matter more than exhaustive detail.
- Every component must appear in at least one connection. Do not leave
  disconnected components.
- At most 3 technology decisions, 3 scalability notes, and 3 failure scenarios.
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
  no requirement applies. Every must-have functional requirement (priority
  "must") must appear in the requirementRefs of at least one component or flow
  that genuinely implements it. Never invent ids or attach a requirement to
  unrelated elements.`;
}

export function hldUserPrompt(
  idea: string,
  requirementsJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}`;
}

export function lldSystemPrompt(): string {
  return `${CORE_RULES}

Task: produce only the low-level design (LLD) and model metadata for an
architecture whose HLD is already fixed.
Rules:
- Aim for 8-14 classes, 10-20 relationships, and 2-5 justified design patterns.
  Never exceed 18 classes, 30 relationships, or 6 patterns. Prefer one connected
  class graph. Completeness and readability matter more than exhaustive detail.
- Classes use ids like cls_<name>; relationships rel_<name>; patterns pat_<name>.
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
- Every class, abstract class, and interface must have at least one
  relationship. enum and value_object classes may stand alone only when they
  are used as member types. Do not leave disconnected classes.
- Before returning, check multiplicities: composition/aggregation source is
  "1" or "0..1"; inheritance/realization use "1" on both ends.
- Method signature must start with "(" and must not repeat the method name.
- ${DESIGN_PATTERN_CATALOG}
- meta.title and meta.summary describe this specific system.
- HLD element ids are pinned; reuse them exactly and never rename them.
- requirementRefs (classes and patterns) must use ids from the confirmed
  requirements. Every must-have functional requirement not already covered by
  an HLD component or flow must be referenced by at least one class or pattern
  that genuinely implements it. Never invent ids or attach a requirement to
  unrelated elements.
- Do not output DSA recommendations or learning steps.`;
}

export function lldUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}`;
}

export function dsaSystemPrompt(): string {
  return `${CORE_RULES}

Task: produce only the DSA analysis for an architecture whose HLD and LLD are
already fixed.
Rules:
- Return 3-6 DSA recommendations and at most 4 algorithmic patterns. Do not
  repeat entries. Prefer operation-scoped entries over a technology catalog.
- DSA recommendation ids use dsa_<name>; algorithmic pattern ids use
  alg_<name>.
- For each recommendation state the operation, layer (lld, hld, shared),
  data structure, algorithm, honest average-case and worst-case complexity in
  words, assumptions, alternatives, limitations, and requirementRefs.
- Keep each complexity string under 240 characters; keep algorithm and
  dataStructure strings concise.
- Complexity must be derivable from the stated data structure and algorithm.
  Do not claim constant time for a scan, lock contention, or network round trip.
- HLD and LLD element ids are pinned; do not rename or invent them.
- requirementRefs must use ids from the confirmed requirements, or be empty when
  no requirement applies. Never attach a requirement to an unrelated operation.
- Do not output classes, relationships, patterns, or learning steps.`;
}

export function dsaUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
  lldJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}\n\nPinned LLD (JSON):\n${lldJson}`;
}

export function learningSystemPrompt(): string {
  return `${CORE_RULES}

Task: produce only the learning walkthrough for an architecture whose HLD, LLD,
and DSA are already fixed.
Rules:
- Aim for 4-8 learning steps in a sensible teaching order.
- Learning step ids use step_<name>.
- Each step has a short title, a concise explanation, and at least one
  elementRefs entry.
- elementRefs may contain only existing HLD/LLD/DSA element ids (cls_, rel_,
  pat_, cmp_, conn_, flow_, tech_, scale_, fail_, dsa_, alg_).
- Never use requirement ids (fr_/nfr_), invented ids, or the step's own id.
- Explain why the element matters and how it participates in the design.
- Do not output model metadata, classes, relationships, patterns, or DSA
  recommendations.`;
}

export function learningUserPrompt(
  idea: string,
  requirementsJson: string,
  hldJson: string,
  lldJson: string,
  dsaJson: string,
): string {
  return `Original idea:\n${idea}\n\nConfirmed requirements (JSON):\n${requirementsJson}\n\nPinned HLD (JSON):\n${hldJson}\n\nPinned LLD (JSON):\n${lldJson}\n\nPinned DSA (JSON):\n${dsaJson}`;
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
