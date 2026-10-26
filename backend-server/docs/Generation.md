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

- Phase A (`hld_model`) generates components, connections, flows, technology decisions, scalability notes, and failure scenarios. Budget: 12k output tokens, 360s.
- Phase B (`lld_dsa_model`) generates classes, relationships, patterns, DSA recommendations, learning steps, and model metadata, with the HLD pinned as context. Budget: 64k output tokens, 900s. Reasoning effort defaults to `low` on OpenRouter, but reasoning tokens still share the output budget; GLM-5.3 Flash uses a large share even at low. A truncated response fails fast instead of repeating the same over-budget repair.
- Each phase gets at most 3 attempts: initial + 2 repairs. Repairs include the exact validation issue list and the previous output.
- A failed Phase B leaves the successful Phase A stage row intact.
- `findReusableHld()` can reuse a validated HLD from an earlier failed/interrupted full run with the same requirements hash and valid structure. This avoids paying for Phase A twice.
- `validate` runs the full structural + semantic validator on the merged model, including relationship type and multiplicity compatibility. Structural errors fail the run; warnings are stored in the version report.
- `persist` allocates `max(version)+1`, writes `architecture_versions`, points the project at it, and sets `architecture_ready`.

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
| Truncated output (`finish_reason: length` or incomplete JSON) | Fails fast with `GENERATION_REPAIR_FAILED`; retrying with the same output budget cannot help. Issue rule `truncated_output` preserves the provider reason. |
| Schema or validator errors after repairs | `GENERATION_REPAIR_FAILED` |
| Unexpected exception | `INTERNAL_ERROR` |

`failRun()` marks the currently running stage failed, then the run failed, with the same code/message/details. Usage accumulated before the failure is retained.

## Observability

Persisted per run: status, provider, model, scope, stage timestamps, attempts/retry count, prompt and completion tokens, error code/message/details. Per version: full validation report with warning list and `validatedAt`. Duration is derivable from `createdAt`/`startedAt`/`finishedAt`.

No raw provider payloads are stored or logged. Stage `result` holds only validated structured data and validation reports.

Related: [[Home]] · [[Architecture]] · [[Providers]] · [[Data-Model]] · [[Testing]]
