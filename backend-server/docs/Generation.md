# Generation

Generation is asynchronous and DB-backed. The API queues a run, an in-process worker claims it, and every stage transition is persisted before it is returned to clients.

## Run lifecycle

```mermaid
stateDiagram-v2
  [*] --> queued: POST run endpoint
  queued --> running: worker claim
  running --> succeeded: all stages pass
  running --> failed: AppError or unexpected failure
  queued --> interrupted: server restart
  running --> interrupted: server restart
  failed --> [*]
  succeeded --> [*]
  interrupted --> [*]
```

- One active run per project is enforced twice: `RunService.hasActiveRun()` for a clean `RUN_CONFLICT`, and a partial unique index on `generation_runs(project_id)` where status is `queued` or `running` for concurrent double-POSTs.
- The unique-violation path is translated to `RUN_CONFLICT`.
- A failed or interrupted run does not block a retry.
- At startup, `reconcileInterrupted()` marks every queued/running run as `interrupted` and its pending/running stages as `failed`. There is no silent auto-restart.

## Stages

| Run type | Stage order |
| --- | --- |
| Requirements | `analyze_idea`, `persist` |
| Full architecture | `hld_model`, `lld_dsa_model`, `validate`, `persist` |
| Scoped regeneration | `<scope>_model` (`hld_model`, `lld_model`, or `dsa_model`), `validate`, `persist` |

Each row starts `pending`, becomes `running` when work begins, then `succeeded` or `failed`. Attempts, timestamps, token usage, and safe error details are stored on the row. The run DTO orders stages by persisted position; no stage is simulated.

## Worker

```mermaid
sequenceDiagram
  participant API as RunService
  participant Q as generation_runs
  participant W as GenerationWorker
  participant P as ModelProvider
  participant G as Generators
  API->>API: resolve provider, bind BYOK key in memory
  API->>Q: insert run + stages (queued)
  API->>W: wake()
  loop poll interval
    W->>Q: claimNextQueued (conditional update)
  end
  W->>G: generate / validate
  G->>P: generateStructured
  P-->>G: JSON + usage
  G-->>W: validated section or AppError
  W->>Q: update stage/run rows
```

Key properties:

- Concurrency 1: one tick at a time, one run per tick.
- The provider instance for a run is registered in an in-memory `Map<runId, ModelProvider>` before the run row is created. It is deleted in `finally`, whether the run succeeds or fails.
- The BYOK key exists only inside the bound provider closure; it is never written to the database or logs.
- If the server restarts, the map is empty. Reconciliation marks the old run interrupted rather than trying to continue without credentials.
- A claimed run missing its in-memory provider fails with `PROVIDER_AUTH_FAILED`.
- Defensive tick failures are logged; the interval keeps polling.

## Requirements pipeline

1. `analyze_idea` calls the model with the requirements schema, `maxOutputTokens=4000`, timeout 90s, temperature 0.2.
2. Output is validated as `RequirementsAnalysisOutputSchema`.
3. On schema or JSON failure, one repair attempt includes the exact failing rules and the previous output.
4. Exhausted repairs produce `GENERATION_REPAIR_FAILED` with `stage` and bounded `issues`.
5. Valid output receives server-assigned `fr_`, `nfr_`, `asm_`, and `q_` ids.
6. `persist` replaces the project's editable specification and resets confirmation (`requirements_ready`, no snapshot).

The user then edits and confirms the spec via `PUT /requirements`. Confirmation writes an immutable `ConfirmedRequirements` snapshot used by architecture generation.

## Two-phase architecture pipeline

```mermaid
flowchart LR
  S[Confirmed snapshot] --> A[Phase A: HLD]
  A --> V1{Validate HLD}
  V1 -->|errors| RA[Repair x2]
  RA --> V1
  V1 -->|valid| P1[Persist hld_model stage result]
  P1 --> B[Phase B: LLD + DSA + learning]
  B --> V2{Validate section against HLD}
  V2 -->|errors| RB[Repair x2]
  RB --> V2
  V2 -->|valid| M[Merge canonical model]
  M --> FV{Final validation}
  FV -->|errors| FAIL[GENERATION_REPAIR_FAILED]
  FV -->|warnings only| V[Persist architecture version]
```

- Phase A (`hld_model`) generates components, connections, flows, technology decisions, scalability notes, and failure scenarios. Budget: 64k output tokens, 900s. The prompt targets 6-12 components, 8-16 connections, and 1-2 flows; every component must appear in a connection. A `finish_reason: length` truncation is retried once with a compact-output instruction (≤8 components, ≤10 connections, 1-2 flows); repeated truncation fails with `GENERATION_REPAIR_FAILED`. Must-have functional requirements must be referenced by at least one component or flow: uncovered ids are fed into the bounded repair message, and persistent omission fails the run instead of persisting an architecture that ignores them.
- Phase B (`lld_dsa_model`) generates classes, relationships, patterns, DSA recommendations, learning steps, and model metadata, with the HLD pinned as context. Budget: 64k output tokens, 900s. The prompt targets 8-14 classes, 10-20 relationships, 2-5 patterns, 3-5 DSA recommendations, and 4-8 learning steps. Reasoning effort defaults to `low` on OpenRouter, but reasoning tokens still share the output budget. A truncated response fails fast instead of repeating the same over-budget repair. The merged model (HLD + classes + patterns + DSA recommendations) is re-checked for must-have coverage; gaps are repaired within the same 3-attempt bound.
- Each phase gets at most 3 attempts: initial + 2 repairs. Repairs include the exact validation issue list and the previous output.

### Must-have coverage

`unreferenced_must_requirement` means a `must` functional requirement is not in any component/flow (HLD) or class/pattern/DSA recommendation (merged LLD/DSA) `requirementRefs`. The validator keeps it as a warning for arbitrary models, but generation promotes it to a repairable error:

- after the HLD validates, uncovered ids and their text are added to the repair message;
- after the merged LLD/DSA validates, the same check runs across both sections;
- persistent omission ends with `GENERATION_REPAIR_FAILED` (`issues[].rule = "unreferenced_must_requirement"`) and no version is persisted.

Prompts state the rule and forbid invented refs. A successful generation therefore has full must-have coverage and does not carry this warning.
- A failed Phase B leaves the successful Phase A stage row intact.
- `findReusableHld()` can reuse a validated HLD from an earlier failed/interrupted full run with the same requirements hash and valid structure. This avoids paying for Phase A twice.
- `validate` runs the full structural + semantic validator on the merged model, including relationship type and multiplicity compatibility. Structural errors fail the run; warnings are stored in the version report.
- **LLD connectivity:** every class, abstract class, and interface should have at least one relationship. `enum` and `value_object` may stand alone only as member types. Orphan classes are reported as `orphan_class` warnings; the prompt asks the model to connect them, but a valid diagram is still persisted for flexibility.
- **HLD connectivity:** every component should appear in at least one connection. Orphan components are reported as `orphan_component` warnings; the prompt asks the model to connect them.
- **Design-pattern catalog:** the LLD prompt carries a candidate catalog (creational, structural, behavioral, plus the Null Object special idiom). It is not a checklist: 2-5 justified patterns are preferred, and pattern participants must be connected by relationships that express the pattern. Method signatures must start with `(` and must not repeat the method name.
- `persist` allocates `max(version)+1`, writes `architecture_versions`, points the project at it, and sets `architecture_ready`.

### Provider calls per run

Only requirements, HLD, and LLD/DSA call the model. Validation and persistence are local.

| Phase | Provider calls | Notes |
| --- | --- | --- |
| Project creation | 0 | Local DB write. |
| Requirements analysis | 1 + up to 1 repair = 1–2 | `analyze_idea` stage. |
| HLD | 1 + up to 2 repairs = 1–3 | `hld_model` stage. Skipped when a compatible HLD is reused. |
| LLD + DSA + learning | 1 + up to 2 repairs = 1–3 | One combined `lld_dsa_model` stage. |
| Validation + persistence | 0 | Local code. |

A full architecture from an idea is therefore **3–8 model calls** including requirements. A retry with HLD reuse is **2–5 calls**. Each repair is another full model request with the previous output and the failing issues; calls run sequentially, never in parallel. In a local sample of successful runs, requirements used 1 call, HLD used 3 (when newly generated), and LLD/DSA used 3; the latest run reused HLD and used 3 LLD/DSA calls, totaling 64,230 tokens. A 2026-10-30 smoke with the 64k HLD budget completed in 81.5 s: requirements 701 tokens (1 call), HLD 4,188 tokens (1 call), LLD/DSA 24,502 tokens (2 attempts), 28,690 tokens total, valid version 1 with 0 errors and 0 warnings.

### Token optimizations

- **Previous output is sent once per repair.** The repair user message contains it; the generator no longer also adds it as an assistant message.
- **Prompt context is compacted.** LLD/DSA prompts receive ids, names, types, relationships, and short intent instead of the full HLD/LLD rationale/trade-off prose. This cuts the HLD JSON about 40% and the LLD JSON about 53% on the live sample. A scoped LLD regeneration after these changes used **2 attempts, 10,208 prompt + 11,987 completion = 22,195 tokens**, versus the previous full LLD stage at **3 attempts, 45,283 + 18,947 = 64,230 tokens**.
- **Deterministic validation mistakes are normalized before parsing.** Composition/aggregation source multiplicity becomes `"1"`; inheritance/realization becomes `"1"` on both ends. Learning refs that are not architecture element ids are dropped; steps with no valid refs are removed. Invalid requirement refs are filtered.
- **HLD reuse** skips the HLD call on retry when the requirements hash and a valid HLD match.
- **Concise targets**: HLD 6–12 components / 8–16 connections / 1–2 flows; LLD 8–14 classes / 10–20 relationships / 2–5 patterns / 3–5 DSA recommendations / 4–8 learning steps. `max_tokens` is a cap, not a reservation; actual output is billed.

## Scoped regeneration

`POST /architecture/regenerate` accepts `hld`, `lld`, or `dsa`:

1. Load the current architecture version.
2. Summarize the requirements diff between the version's snapshot and the current confirmed spec.
3. Regenerate only the requested section.
4. Merge it with the pinned untouched sections.
5. Prune learning-step references to elements removed by the new section. Pruned references become warnings.
6. If every learning step loses all references, fail with `GENERATION_REPAIR_FAILED` and tell the user to regenerate the full architecture.
7. Validate the merged model, then persist a new version.

DSA regeneration does not touch `hld` or `lld`; the e2e suite asserts the untouched sections serialize byte-for-byte identically to the previous version. HLD regeneration keeps the LLD/DSA objects but prunes any learning references that no longer resolve.

## Failure mapping

| Condition | Run error |
| --- | --- |
| Missing or invalid provider key | `PROVIDER_AUTH_FAILED` |
| Provider 429 | `PROVIDER_RATE_LIMITED` (with `retryAfterSeconds` when supplied) |
| Provider timeout / 408 / 504 | `PROVIDER_TIMEOUT` |
| Provider network / 5xx | `PROVIDER_UNAVAILABLE` |
| Context length or capability rejection | `PROVIDER_UNSUPPORTED_CAPABILITY` |
| Invalid JSON / empty / oversized output | Repaired when parseable; oversized output is rejected. If still failing after attempts, `GENERATION_REPAIR_FAILED`. |
| Truncated output (`finish_reason: length` or incomplete JSON) | HLD: one compact retry, then `GENERATION_REPAIR_FAILED`. Other stages: `GENERATION_REPAIR_FAILED` immediately. Issue rule `truncated_output` preserves the provider reason. |
| Schema or validator errors after repairs | `GENERATION_REPAIR_FAILED` |
| Must-have requirement unreferenced after repairs | `GENERATION_REPAIR_FAILED` with `issues[].rule = "unreferenced_must_requirement"` |
| Unexpected exception | `INTERNAL_ERROR` |

`failRun()` marks the currently running stage failed, then the run failed, with the same code/message/details. Usage accumulated before the failure is retained, and usage attached to the provider failure (`error.details.usage`, including the nested `providerOutput` of a repair-exhausted error) is added to the run and stored on the failed stage. Failed calls therefore count toward plan tokens and dashboard analytics.

## Live run stream (SSE)

`GET /api/runs/:runId/events` is the push alternative to polling. It uses the same `x-project-key` or owner Bearer auth as `GET /api/runs/:runId`.

- On connect, the controller subscribes to the in-process event bus, reads the persisted run and stages, and immediately replays every stage row in position order followed by the current run state.
- Live events then arrive as SSE frames: `id: ...`, `event: run|stage`, `data: <RunStreamEvent JSON>`.
- `run` frames carry status, safe error, usage, and `updatedAt`.
- `stage` frames carry name, status, attempt, started/finished times, safe error, and nullable usage.
- Frame `data` is a `RunStreamEvent`, not the polling `GenerationRun` DTO; clients that need the full DTO should use polling or merge stage frames themselves.
- Repair attempts are emitted as `stage` frames with `status: "running"` and the higher `attempt` number.
- A comment heartbeat (`: heartbeat`) is written every 10 seconds, below the client idle timeout. It is an SSE comment with no `id`, `event`, or `data`, so it does not enter the event sequence or the `Last-Event-ID` cursor. The response closes immediately after a terminal run event (`succeeded`, `failed`, or `interrupted`), and the heartbeat timer is cleared on close.
- `Last-Event-ID` (or the optional `?lastEventId=` fallback) is resolved against the persisted snapshot; if the id no longer matches current state, the full persisted snapshot is replayed. No in-memory history is required.
- Polling remains supported and returns the same persisted state and stage order.

The event bus is intentionally process-local: one backend instance only. Multi-instance deployments need Redis pub/sub (or equivalent) and are deferred; without it, a client connected to one instance will not receive events emitted by another. No provider keys or raw model payloads are placed on the bus or in SSE frames. Interrupted runs are surfaced by the persisted snapshot on reconnect because no live connection survives the restart that caused them.

## Observability

Persisted per run: status, provider, model, scope, stage timestamps, attempts/retry count, prompt and completion tokens, error code/message/details. Per version: full validation report with warning list and `validatedAt`. Duration is derivable from `createdAt`/`startedAt`/`finishedAt`.

No raw provider payloads are stored or logged. Stage `result` holds only validated structured data and validation reports.

Related: [[Home]] · [[Architecture]] · [[Providers]] · [[Data-Model]] · [[Testing]]
