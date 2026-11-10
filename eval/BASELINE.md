# Offline Baseline — Architecture v1

Frozen: 2026-11-09

Dataset: `sda-v1`, 12 dev cases. Dataset hash:

```text
1f14186ab2732531ea69da6bff6f9af46a3b48888864728a0ec24a4ba412a7c0
```

Generation model: `z-ai/glm-5.3-flash`.

Production prompt hash:

```text
a8cd88f79254eb970aa32fbe819b2d3e2af6024e619bad95ec30096a0d6d3616
```

## Structural baseline

| Metric | Value |
|---|---:|
| Runs | 24 |
| Valid | 24 |
| Pass@1 | 12/12 |
| Pass on both repeats | 12/12 |
| Failed | 0 |
| Average duration | 105.6 s |
| p95 duration | 232.2 s |
| Total tokens | 683,539 |
| Cost | $0.246378 |
| Cost per valid architecture | $0.010266 |

Component averages:

| Component | Average |
|---|---:|
| HLD components | 10.08 |
| HLD connections | 14.00 |
| HLD flows | 1.88 |
| LLD classes | 15.54 |
| LLD relationships | 19.08 |
| LLD patterns | 3.25 |
| DSA recommendations | 4.42 |
| DSA algorithmic patterns | 2.46 |
| Learning steps | 7.17 |
| Unresolved learning refs | 0 |

Requirements matrix: 8 models × 12 cases × 2 repeats = 192 runs; 185 valid, 7 failed; 347,773 tokens; $0.096214.

## Split component eval

The production generator now makes separate calls for LLD, DSA, and learning.

| Metric | Value |
|---|---:|
| Cases | 12 |
| First-pass valid | 11/12 |
| Valid after one retry | 12/12 |
| Failed case retried | `TC-OBS-010` |
| Total tokens | 373,061 |
| Cost | $0.117237 |
| Cost per valid | $0.010658 |
| Average duration | 175.7 s |
| p95 duration | 407.4 s |

Component averages:

| Component | Average |
|---|---:|
| HLD components | 10.58 |
| HLD connections | 14.00 |
| HLD flows | 2.08 |
| LLD classes | 14.55 |
| LLD relationships | 18.36 |
| LLD patterns | 2.64 |
| DSA recommendations | 5.91 |
| DSA algorithmic patterns | 3.64 |
| Learning steps | 7.64 |
| Unresolved learning refs | 0 |

Split semantic judge panel, 11 valid outputs:

| Judge | Mean | Success | Hard-flag records |
|---|---:|---:|---:|
| Claude Haiku 5.5 | 3.148 | 0/11 | 10/11 |
| GPT-5 Nano | 3.909 | 4/11 | 3/11 |

Mean absolute inter-judge difference: **0.761/5**.

## Requirements semantic judge

24 GLM requirements outputs, 2 repeats.

| Judge | Mean | Success | Hard-flag records |
|---|---:|---:|---:|
| Claude Haiku 5.5 | 3.432 | 0/24 | 23/24 |
| GPT-5 Nano | 3.667 | 4/24 | 18/24 |

Mean absolute inter-judge difference: **0.38/5**.

## Semantic judge v3

Two independent judges scored the same 24 GLM outputs with `architecture-judge-v3.md`.

| Judge | Mean | Success (≥4, no flags) | Hard-flag records | Scored |
|---|---:|---:|---:|---:|
| Claude Haiku 5.5 | 3.182 | 0/24 | 22/24 | 24/24 |
| GPT-5 Nano | 4.042 | 13/24 | 6/24 | 24/24 |

Mean absolute inter-judge difference: **0.859/5**.

Dimension means:

| Dimension | Claude | GPT |
|---|---:|---:|
| Traceability | 3.083 | 4.792 |
| HLD boundaries | 3.042 | 3.958 |
| LLD responsibility | 2.625 | 3.833 |
| DSA correctness | 2.583 | 4.333 |
| Simplicity | 3.208 | 3.042 |
| Pedagogical quality | 3.792 | 4.292 |
| Learning quality | 3.500 | 4.292 |
| Interview usefulness | 3.625 | 3.792 |

This is not a release gate. The judges disagree too much on absolute quality.

## Mutation tests

Each batch has six semantic mutants and blind controls.

| Batch | Detected by ≥1 | Detected by both | Control flag instability | Control noise | Max unrelated drop | Gate |
|---|---:|---:|---:|---:|---:|---|
| Architecture v1, judge v3 | 6/6 | 5/6 | 2 cases | 0.875 | 0.786 | fail |
| Held-out v1, judge v3 | 6/6 | 5/6 | 5 cases | 0.750 | 1.167 | fail |

The judge detects most obvious defects, but it does not consistently turn named defects into flags or score drops. Example: Claude named the rate-limiter GET/SET race in its rationale but did not lower the target dimensions or add a matching flag.

## Known limits

- No human labels. The judge is uncalibrated; only relative regression and defect discovery are defensible.
- Dev set only: 12 cases. Validation and holdout sets are empty.
- LLD, DSA, and learning are now separate calls; independent component attribution is available. One first-pass LLD failure (`TC-OBS-010`) passed on retry, so stochastic structural reliability is not perfect.
- Requirements generation was evaluated structurally and semantically; requirements-to-architecture handoff is not yet a separate pipeline run.
- Control outputs are real GLM outputs with pre-existing semantic gaps; control hard flags are not pure false positives.
- Absolute scores must not be used as release thresholds.

## Artifacts

Raw outputs are local and gitignored:

```text
eval/artifacts/structural/aggregate-architecture.json
eval/artifacts/structural/aggregate-requirements.json
eval/artifacts/judge/v3-panel/aggregate-v3-panel.json
eval/artifacts/judge/v3-panel/aggregate-v3-panel.md
eval/artifacts/judge/split-v1/aggregate-v3-panel.json
eval/artifacts/judge/requirements-v1/aggregate-v3-panel.json
eval/artifacts/structural/aggregate-learning.json
eval/artifacts/mutation/architecture-v1-v3/mutation-report.json
eval/artifacts/mutation/heldout-v1/mutation-report.json
```

Committed baseline:

```text
eval/baseline/architecture-glm-v1.json
```
