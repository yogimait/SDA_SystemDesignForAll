# Pending Evaluation Work

Parked on 2026-11-10. Product feature work now takes priority. Nothing here is
deleted; this file records the open evaluation debts.

## Judge validity

- Absolute semantic scores are not a release gate. Claude and GPT disagree by
  0.859/5 on the 24-output architecture panel and 0.761/5 on split outputs.
- No human labels exist, so judge validity is unresolved.
- Decide between pairwise relative judging and structured online user feedback.
- Do not tune another judge prompt against the same mutation set.

## Dataset

- Current dataset: 12 dev cases, all draft.
- Validation: 0/10.
- Holdout: 0/5; must stay outside Git.
- The final generalization gate cannot run until validation and holdout exist.
- Requirements-to-architecture handoff is not a separate pipeline run; structural
  architecture eval uses the case's confirmed requirements.

## Known quality gaps to revisit

- Missing must-haves in generated architecture: offline delivery, presence
  fan-out, idempotent send, dead-letter handling, click counting on cache hits.
- Priority drift between reference and generated requirements.
- NFR target drift (`p95` vs `p99`, `TBD`, unbounded wording).
- Unsupported complexity claims: B-tree lookup as `O(1)`, pub/sub fan-out as
  `O(1)`, lock contention ignored.
- Security gaps: unauthenticated operator policy endpoint, public media/object
  storage, unsigned webhook paths.
- Overengineering: too many classes/patterns for low-complexity cases.

These are product prompt/validation issues, not proof that every score is valid.

## Requirements consistency and agent-system coverage (2026-11-13)

Recorded from the Local AI Workforce export review
(`eval/reviews/2026-11-13-local-ai-workforce.md`). The external score is not a
gate.

- Requirements consistency is not a gate. A local-only NFR alongside a
  confirmed cloud LLM clarification, or an "execution out of scope" assumption
  alongside a test agent that runs code, must be surfaced as an explicit
  finding. Blocking rules cover structure and NFR measurability, not
  cross-requirement contradictions.
- Security and runtime coverage is thin for agent/tool systems: sandbox, tool
  permissions, secret brokering, prompt-injection boundary, and destructive-op
  approval are not required by the rubric. The LLD contract also has no agent
  runtime adapter, tool-call contract, timeout, or cancellation path.
- Export diagram readability is a separate defect class from design quality.
  Wide HLD/LLD diagrams print as thin bands on portrait Letter pages, LLD
  relationship rows omit endpoint class names, and the source URL truncates.
  Fix print layout and endpoint rendering; do not score them as design errors.
- Sequence diagrams and interactive learning are product follow-ups, not eval
  gates. The export has two diagrams and static learning steps only.
- Draft case `TC-WORKFORCE-013` is proposed but not added. Adding it requires a
  new dataset version and manifest hash; the frozen `sda-v1` file stays at 12
  dev cases.

## Automation

- Regression gate exists (`npm run eval:regression`) but is not wired into CI.
- LangSmith online sampling is not configured; no API key in the environment.
- Mutation control stability is still poor; do not use it as a release gate.
- Full semantic panel on split outputs covers 11/12 cases because one first-pass
  LLD output was invalid; `TC-OBS-010` passed on retry.

## Deferred

- Independent HLD-only semantic judge.
- Requirements-to-architecture pipeline eval with generated requirements.
- Prompt tuning based on judge flags. Do this only after the dataset and judge
  policy are stable.
