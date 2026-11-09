# Evaluation Matrix

## Component evals

| Stage | Structural checks | Semantic rubric | Main artifacts |
|---|---|---|---|
| Requirements | FR/NFR arrays, priorities, NFR category/target, non-empty FR, unique IDs | Clarity, testability, assumptions, clarification quality | requirements JSON, contract validation |
| HLD | component types, unique IDs, valid connections, flow refs, no self-connections, requirement refs | boundaries, flow, scaling, failures, technology rationale | HLD JSON, validation report |
| LLD | unique class IDs, member shape, relationship endpoints, multiplicity matrix, pattern participants, refs | responsibility, cohesion, patterns, over-engineering | LLD JSON, validator issues |
| DSA | operation/layer present, structure/algorithm present, average/worst complexity, refs valid | correctness, honesty, assumptions, alternatives, limitations | DSA JSON, validator issues |
| Learning | refs resolve to final model, no requirement IDs in element refs, sequence non-empty | grounding, progression, accuracy, interview usefulness | learning JSON |

## Judge reliability evals

The semantic judge itself is evaluated without human labels:

| Check | Method | Current result |
|---|---|---|
| Inter-judge agreement | Same records scored by two independent judges | 0.475/5 mean absolute disagreement on 5 records |
| Test-retest stability | Duplicate clean controls in one blind batch | Max 0.5/5 mean absolute difference |
| Defect sensitivity | Six injected semantic defects plus controls | 5/6 caught by at least one judge; 4/6 by both |
| Localization | Target dimension drop and unrelated dimension change | One missed trace defect; one security defect caused a 0.917 unrelated drop |
| Control flag stability | Same clean control repeated blind | 2 of 6 judge-case controls had unstable hard flags |

A judge is not a release gate unless it passes sensitivity, control stability,
and localization. Current result: **not a release gate**. Use it for relative
regression and defect discovery only.

## Pipeline evals

- Requirements confirmation is the only context passed to HLD.
- HLD IDs are pinned for LLD and DSA.
- LLD and DSA do not invent components or requirements.
- Learning refs resolve in the merged model.
- A failed later stage preserves successful earlier-stage results.
- Scoped regeneration preserves untouched sections byte-for-byte.
- No duplicate stage rows, no active-run conflict, no fake success.

## End-to-end evals

- Canonical model validates with zero blocking errors.
- LLD/HLD/DSA are mutually consistent.
- Export contains no raw contract IDs or invented metrics.
- The same project can be reloaded after restart.
- Usage, latency, retries, and failure codes are persisted.

## Latency evals

Measure per stage and per model:

- provider request latency p50/p95
- queue wait before worker claim
- time to first SSE stage event
- stage completion latency
- end-to-end run latency
- repair/retry added latency
- timeout and truncation frequency
- cost per valid output at that latency

Latency is not just monitoring. A model that is cheaper but much slower can be
worse for the learning flow. Record it with every structural result.

## Operational and security evals

- Truncation, 429, 5xx, timeout, malformed-JSON, and empty-output rates.
- Provider fallback behavior and rate-limit backoff.
- No API keys, ciphertext, IVs, tags, or PII in traces or artifacts.
- Prompt-injection resistance in idea text and clarification answers.
- Per-user quota and rate-limit enforcement.
- Account deletion removes credentials and sessions.

## Reference model

This suite is **criterion-based with reference constraints**, not exact-output
matching and not a purely reference-free evaluation.

- Reference constraints: confirmed requirements, must-have behaviours,
  acceptable alternatives, anti-patterns, schema, validator.
- Criterion-based semantic judge: rubric plus case context.
- No single gold architecture is stored or compared.
- Pairwise reference-free judging is optional for style/pedagogy comparisons.

## Regression gates

Run on every prompt/model/pipeline change:

1. Validate dataset schema.
2. Run structural suite on frozen dev/validation cases.
3. Run DeepEval semantic suite.
4. Compare with the last baseline.
5. Fail on schema pass-rate drop, must-have coverage drop, truncation increase,
   or cost-per-valid increase.
6. Run holdout once before release.
7. Record dataset hash, prompt version, judge version, model ID, and git SHA.

Initial gates are baseline-relative. Do not invent “95% pass” thresholds before
the baseline exists.

## Split policy

- `dev`: prompt and harness iteration.
- `validation`: model/routing selection.
- `holdout`: final release gate only; stored outside Git.
