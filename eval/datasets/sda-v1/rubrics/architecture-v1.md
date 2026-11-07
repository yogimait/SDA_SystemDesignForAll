# Architecture Rubric — v1

Use this rubric only after structural validation passes. Invalid output is a hard
fail and is not scored.

Scores are integers from 1 to 5.

## Dimensions

### 1. Requirement traceability

- 1: Most must-have requirements are unreferenced or mapped to unrelated
  elements.
- 3: Major requirements are referenced; some must-have behaviours are missing.
- 5: Every must-have requirement is explicitly implemented or explained, with
  correct refs.

### 2. HLD boundaries and flow

- 1: Monolithic or incoherent components; data flow is unclear.
- 3: Basic layers exist, but boundaries or failure domains are weak.
- 5: Clear boundaries, realistic connections, coherent flows, explicit failure
  handling, and scaling notes grounded in requirements.

### 3. LLD responsibility and relationships

- 1: Classes are vague, duplicated, or unrelated to the design; relationships
  are wrong.
- 3: Responsibilities are mostly clear; some relationships or multiplicities
  are questionable.
- 5: Cohesive classes, correct relationships, useful interfaces/value objects,
  justified patterns, and no obvious over-engineering.

### 4. DSA correctness and honesty

- 1: Wrong structure or algorithm, incorrect complexity, or invented facts.
- 3: Plausible structure and bounds; minor edge cases or trade-offs missing.
- 5: Correct operation-scoped structures, defensible average/worst bounds,
  explicit assumptions, alternatives, and limitations.

### 5. Simplicity

- 1: Over-engineered or under-designed for the stated requirements.
- 3: Reasonable design with some unnecessary or missing complexity.
- 5: Simplest design that satisfies the requirements; complexity is justified.

### 6. Pedagogical quality

- 1: Confusing or unexplained; little learning value.
- 3: Clear but uneven explanation; some reasoning is implicit.
- 5: Explains what, why, trade-offs, and alternatives in an interview-ready way.

### 7. Learning quality

- 1: Learning steps are missing, repetitive, or reference the wrong elements.
- 3: Steps are grounded but shallow; sequence is only partly useful.
- 5: Steps build understanding in a logical order, reference real elements, and
  explain why the design works.

### 8. Interview usefulness

- 1: Advice would be misleading or impractical in an interview.
- 3: Generally sound, but lacks follow-up depth.
- 5: Actionable, defensible, and useful under interview questioning.

## Stage-specific checks

### Requirements

- FRs are atomic, testable, and prioritized.
- NFRs have measurable targets where relevant.
- Assumptions are explicit, not hidden facts.
- Clarifications are useful and answerable.

### HLD

- Components have one clear responsibility.
- Connections are directional and labelled.
- At least one realistic failure scenario and scaling consideration.
- Technology choices have a reason, not just a name.

### LLD

- No orphan classes above threshold.
- Relationships use valid kinds and multiplicities.
- Patterns are justified; no pattern stuffing.
- Method signatures are meaningful and non-duplicated.

### DSA

- Every recommendation names the operation it serves.
- Complexity is stated for average and worst case.
- Alternatives and limitations are realistic.
- No invented requirement or element references.

### Learning

- Every step references a real element in the final model.
- The sequence builds understanding rather than repeating the diagram.
- No fabricated metrics, benchmarks, or claims.

## Scoring rule

For a valid output, compute the mean of the eight dimensions.
Reject or flag a candidate when any dimension is below 3.

Do not let the judge override a structural failure.
