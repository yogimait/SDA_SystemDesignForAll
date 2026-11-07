# Offline and Online Evaluation — SDA

This directory is the source of truth for model evaluation. It is intentionally
separate from the product database.

## Tool decisions

| Layer | Tool |
|---|---|
| Golden dataset | Git JSONL + manifest |
| Structural checks | TypeScript validator + eval runner |
| Offline semantic checks | DeepEval, Python sidecar |
| Online traces / experiments | LangSmith |
| Self-hosted trace alternative | Langfuse |
| Pipeline orchestration | Existing NestJS worker |
| LangGraph | Deferred; no agent graph in production |

DeepEval evaluates quality. LangSmith observes real runs. Neither owns the
golden dataset.

## Dataset rules

- `datasets/sda-v1/cases.jsonl` is the source of truth.
- Every case has a stable `id`, a split, and explicit requirements.
- Do not store one exact expected architecture. Store must-have behaviours,
  acceptable alternatives, anti-patterns, and rubric notes.
- Dev and validation cases live in Git.
- The holdout set must live outside Git, in a private store. Record its hash in
  `manifest.json` before the final run.
- Never edit a case after recording results for that dataset version. Create a
  new version instead.
- Do not use real user prompts or personal data in the golden set without
  explicit consent.

## Evaluation layers

### Component evals

Run each stage independently against the same confirmed requirements:

- Requirements: FR/NFR completeness, clarity, priority, measurable NFR targets,
  assumptions, clarification quality.
- HLD: component types, boundaries, connections, flows, failure scenarios,
  scaling notes, technology rationale, requirement refs.
- LLD: classes/interfaces/value objects, responsibilities, members,
  relationships and multiplicities, patterns, rationale, requirement refs.
- DSA: operation scope, data structure, algorithm, average/worst complexity,
  assumptions, alternatives, limitations, requirement refs.
- Learning: grounded element refs, correct explanation, logical progression,
  interview usefulness.

Structural checks run before semantic scoring. Invalid output is a hard fail
and is not scored by the LLM judge.

## Reference model

This is a **mixed criterion-based evaluation**, not exact-output matching and
not a purely reference-free judge.

- **Reference-based:** schema, validator rules, confirmed FR/NFR IDs, must-have
  behaviours, acceptable alternatives, anti-patterns, and regression baselines.
- **Criterion-referenced semantic scoring:** the judge receives the case
  requirements and rubric, so it is not judging in a vacuum.
- **No single gold architecture:** many designs are valid. We do not compare
  generated JSON to one canonical answer.
- **Reference-free pairwise mode:** optional for style/pedagogy comparisons
  where two outputs are judged without a reference architecture.

Why: system-design correctness is constraint-based, not string-based. Exact
reference matching would reject valid alternatives and reward memorization.

## Latency metrics

Latency is an evaluation dimension, not just a production dashboard metric.

Measure per model and stage:

- provider request latency: p50/p95
- queue wait before worker claim
- time to first SSE stage event
- per-stage completion latency
- end-to-end run latency
- repair/retry added latency
- truncation/timeout frequency
- cost per valid architecture at that latency

Do not use “time to first model token” unless token streaming is implemented.
The current SSE stream carries stage events, not model tokens.

## Prompt reuse

The evaluation runner must import the production prompts from
`backend-server/src/providers/prompts/index.ts`:

- `requirementsSystemPrompt()`
- `hldSystemPrompt()`
- `lldDsaSystemPrompt()`
- the matching user-prompt builders

Do not duplicate prompts in the eval folder. A prompt change must change both
the product and the evaluation. The judge prompt is separate and versioned in
`datasets/sda-v1/judge-prompts/architecture-judge-v1.md`.

### Pipeline evals

Check handoffs between stages:

- HLD uses the confirmed requirements and invents no new requirements.
- LLD reuses pinned HLD IDs and preserves boundaries.
- DSA is consistent with LLD/HLD operations and does not invent components.
- Learning refs resolve to elements in the final model.
- A failed later stage preserves the successful earlier stage for retry.
- Scoped regeneration preserves untouched sections byte-for-byte.

### End-to-end evals

- Final canonical model validates.
- LLD, HLD, and DSA all describe the same system.
- Export contains no raw contract IDs or invented metrics.
- Latency, tokens, cost, repair attempts, and failure codes are recorded.

### Operational and security evals

- Truncation, 429, 5xx, timeout, and malformed-JSON rates.
- Provider fallback correctness.
- No API keys, ciphertext, IVs, tags, or personal data in traces/artifacts.
- Prompt-injection resistance for idea text and clarification answers.
- Per-user quota enforcement and rate limiting.
- Worker restart/recovery and persisted-stage continuity.

## Regression testing

Regression is not a separate model evaluation. It is a mandatory gate:

1. Validate the dataset schema.
2. Run structural checks on the frozen dataset.
3. Run the DeepEval semantic suite.
4. Compare against the last recorded baseline.
5. Fail the PR when schema pass rate drops or a hard quality metric regresses.
6. Run the holdout exactly once before a model/prompt release.
7. Record dataset hash, prompt version, judge version, model ID, and git SHA.

Suggested initial gates, to be recalibrated after the baseline run:

- no blocking validator errors
- must-have behaviour coverage = 100%
- no invalid requirement or learning refs
- truncation rate below the recorded baseline
- `pass@3` not worse than baseline
- `cost_per_valid` not worse than baseline
- no Critical security/privacy finding

## Commands

```bash
npm run eval:validate
npm run eval:build
npm run eval:structural -- --model z-ai/glm-5.3-flash --stage architecture --limit 1
npm run eval:aggregate -- --stage requirements

# Semantic judge (Python sidecar; no generation calls)
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r judge-requirements.txt
.venv\Scripts\python.exe judge_architecture.py
node aggregate-judge.mjs
```

`eval:validate` checks JSONL structure, unique IDs, split counts, and manifest
hash. It does not call a model.

`eval:structural` runs the real production generators and validator. It writes
raw outputs and a summary under `eval/artifacts/` (gitignored). Use `--limit 1`
for the first smoke run. `--stage requirements`, `--stage hld`,
`--stage lld_dsa`, or `--stage architecture` selects the component scope.

By default the architecture stage uses the case's confirmed requirements, not
the model-generated requirements. That isolates model quality from requirements
generation.

## Current status

- Dataset version: `sda-v1`
- Seed cases: 12 dev cases, draft review status
- Validation and holdout sets: not populated yet
- Structural runner: implemented; one-case smoke passed for requirements, HLD, and full architecture
- Requirements matrix: complete (8 models × 12 cases × 2 repeats)
- GLM architecture baseline: complete (24/24 valid, 12 cases × 2 repeats)
- Semantic judge: complete on 24 GLM outputs; **0/24 passed the 4.0 threshold**, 21/24 had hard flags
- Human calibration: next (5-record sample required before treating scores as a release gate)
- LLD/DSA split: still pending
- LangSmith tracing: after calibration and regression baseline
- Validation and holdout cases: next
