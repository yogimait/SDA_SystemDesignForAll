# Roadmap Planner — Backend

Build plan for `backend-server/` plus the shared contracts package. Each phase ends in a **checkpoint** — a concrete, verifiable list. Do not start a phase while its predecessor's checkpoint is open. Status conventions: `[ ]` open, `[x]` done with date.

Environment facts to respect: NestJS 12 with `"type": "module"`, TypeScript 6 strict, Vitest 4 (unit + e2e configs already wired), oxlint (`typescript/no-floating-promises: error`), Express platform. Port must move from 3000 to **3001**.

---

## Phase B0 — Foundation, contracts, and the API envelope

**Goal**: the backend can boot with config validation, serve enveloped responses, and share one source of truth with the frontend.

- [x] Root npm workspaces: root `package.json` (+ root lockfile), `packages/contracts` package built with `tsc`, wired into both apps' dependencies.
- [x] Contracts content (Zod 4): API envelope schemas (success + error), registered error-code union (`VALIDATION_ERROR`, `PROJECT_NOT_FOUND`, `PROJECT_ACCESS_DENIED`, `RUN_NOT_FOUND`, `RUN_CONFLICT`, `PAYLOAD_TOO_LARGE`, `QUOTA_EXCEEDED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNSUPPORTED_CAPABILITY`, `INVALID_MODEL_OUTPUT`, `GENERATION_REPAIR_FAILED`, `DATABASE_UNAVAILABLE`, `INTERNAL_ERROR`), request/response DTOs for both apps, and the canonical `ArchitectureModel` schema (detailed in Phase B4).
- [x] Backend config module: Zod-validated env (`PORT=3001`, `CORS_ORIGIN`, `DATABASE_DRIVER=pglite|postgres`, `PGLITE_DATA_DIR` or `DATABASE_URL`, `GENERATION_CONCURRENCY=1`, `MOCK_PROVIDER`, `DEFAULT_PROVIDER=openrouter`, `DEFAULT_MODEL`), fail-fast on boot.
- [x] Envelope implementation: global success interceptor (`{ status: true, statusCode, data }`) + global exception filter (`{ status: false, statusCode, message, error: { code, details } }`), `ok()`/`fail()` helpers as the only construction points, `statusCode` always matches the HTTP status.
- [x] Error-code registry module; all filters/services throw through it, never inline strings.
- [x] Zod validation pipe for DTOs (no class-validator dependency); request body size limit configured.
- [x] Throttling (`@nestjs/throttler`, in-memory) on run-start mutation endpoints (where provider spend happens); CORS restricted to `CORS_ORIGIN`.
- [x] Logging helper with secret redaction (`apiKey`, `authorization`, `x-provider-api-key`, `x-project-key`) and a policy to never log request bodies on generation endpoints.
- [x] Health endpoint.

**B0 checkpoint**

- [x] `npm run build`, `npm run lint` (oxlint), `npm run test` green with workspaces installed from root.
- [x] `GET /api/health` returns the enveloped shape; statusCode-correctness covered by unit tests (success + mapped error + unknown error).
- [x] `@sda/contracts` importable from both apps; a shared type compiles in each.
- [x] Missing/wrong env fails boot with a clear message.
- [x] [[Tech-Stack]] updated if any decision shifted.

Status: Done — 2026-10-23.

---

## Phase B1 — Persistence layer (PGlite now, Postgres interface now)

**Goal**: repositories behind interfaces, real Postgres semantics, zero infrastructure.

- [x] Drizzle schema: `projects`, `project_access` (hash of per-project access key), `requirements`, `assumptions`, `clarification_questions`, `generation_runs`, `generation_stages`, `architecture_versions` (canonical model JSONB + validation report JSONB), indexes on `(project_id, created_at)` style keys.
- [x] Driver factory: `drizzle-orm/pglite` (`.data/pglite` dir or in-memory for tests) and `drizzle-orm/node-postgres` behind `DATABASE_DRIVER`; migration runner works for both.
- [x] drizzle-kit setup + first migration; migrations apply at boot (idempotent).
- [x] Repository interfaces in the domain layer; Drizzle implementations in infrastructure; Nest DI tokens for the interfaces.
- [x] Per-project access key: generated server-side, returned once at creation, hashed at rest, checked by an access guard on all project-scoped routes.
- [x] Boot reconciliation helper for runs (used in B3): mark `running` rows as `interrupted` on startup.

**B1 checkpoint**

- [x] Repository integration tests green on PGlite (create/read/update flows for every table, uniqueness constraints, JSONB round-trip).
- [x] Access key hash + guard unit tests: wrong key → `PROJECT_ACCESS_DENIED` envelope.
- [x] Migrations re-run safely; data dir recreated deterministically.
- [x] Documented swap path: `DATABASE_DRIVER=postgres` + `DATABASE_URL` synthesizes the same behavior (one integration test can run against real Postgres later, optional flag).

Status: Done — 2026-10-23.

---

## Phase B2 — Provider layer: OpenRouter + GLM-5.3 Flash

**Goal**: reliable, normalized structured generation through BYOK, isolated behind one interface.

- [x] `ModelProvider` interface + `ProviderRegistry` (openrouter registered only for now; Groq/Gemini adapters are later additions by construction).
- [x] OpenRouter adapter: `chat/completions`, `Authorization: Bearer <key>` from the request header, optional OpenRouter attribution headers, model string from request (default `DEFAULT_MODEL`, e.g. `z-ai/glm-5.3-flash` — **verify exact slug and capabilities via `GET https://openrouter.ai/api/v1/models` during this phase and record it**).
- [x] Structured-output strategy ladder per model capability: (1) `response_format: { type: "json_schema", strict: true }` + provider routing `require_parameters: true`; (2) `json_object` + JSON Schema inlined in the system prompt; (3) prompt-only JSON + tolerant extraction (code-fence/body-slice).
- [x] Zod → JSON Schema converter + sanitization utilities (strip provider-unsupported keywords); unit-tested.
- [x] Error normalization: HTTP 401/403 → `PROVIDER_AUTH_FAILED`; 429 with `Retry-After` → `PROVIDER_RATE_LIMITED`; timeout (AbortController) → `PROVIDER_TIMEOUT`; 4xx capability errors → `PROVIDER_UNSUPPORTED_CAPABILITY`; parse failure → `INVALID_MODEL_OUTPUT`; unknown → generic mapped.
- [x] Per-stage generation params: system prompts under `src/providers/prompts/`, temperature ≈ 0.2, per-stage `maxOutputTokens`, timeouts (requirements 90s, HLD 360s, LLD/DSA 900s).
- [x] Token usage capture (prompt/completion) from responses.
- [x] `MOCK_PROVIDER=1` deterministic fake provider for e2e/demo (fixtures live in `src/providers/mock` because local demos need them, not only tests).

**B2 checkpoint**

- [x] Adapter contract tests (mocked fetch): every normalized error branch, schema-mode fallback ladder, tolerant extraction cases.
- [x] Structured-output ladder with capability fallback and balanced-brace extraction; truncation (`finish_reason: length` or incomplete JSON) is detected, surfaced with its provider reason, and fails fast instead of repeating the same over-budget repair.
- [x] Reasoning-budget guard: `OPENROUTER_REASONING_EFFORT` defaults to `low` (reasoning tokens share `max_tokens`); LLD/DSA budget raised to 64k with a 900s timeout after the 32k live run truncated.
- [x] Local development convenience: `backend-server/.env` can set `OPENROUTER_API_KEY`; the request header wins, production ignores the fallback, and `.env` is gitignored.
- [ ] Live smoke test (manual, real key): model slug/capabilities verified via OpenRouter's model list (`z-ai/glm-5.3-flash`, context 1,048,576, `response_format` + `structured_outputs`); live requirements and HLD generation succeeded, but the full architecture smoke is still pending one paid LLD/DSA retry after the truncation fix.
- [x] Redaction integration test: the API key string appears nowhere in captured logs.
- [x] No orchestration code imports an adapter directly (registry only), verified by an architecture test/lint boundary rule if cheap, else reviewed.

Status: Implemented — live requirements + HLD verified; full architecture smoke pending one paid LLD/DSA retry after the truncation fix.

---

## Phase B3 — Projects, requirements pipeline, and run infrastructure

**Goal**: the idea → editable-spec workflow works end-to-end with real stage tracking.

- [x] Projects module: `POST /api/projects` (idea, ≤8000 chars), access key issuance; `GET /api/projects/:id` behind the guard.
- [x] Run infrastructure: `generation_runs` + `generation_stages` rows; in-process worker (concurrency 1, queue in DB, claims via status transition); stage rows written on real transitions only (`analyze_idea` → `persist`); boot reconciliation → `interrupted` (no silent auto-restart).
- [x] `POST /api/projects/:id/requirements` — starts a requirements run: server-side system prompt analyzes idea, one forced-JSON response → `{ functional: [], nonFunctional: [], assumptions: [], clarifications: [] }`; Zod-validated; NFRs must include measurable-target hints when workload mentioned; assumptions explicit.
- [x] Repair path: one retry with concise error feedback on parse/validation failure before failing the run.
- [x] `GET /api/runs/:runId` (status + ordered stages + error summary + usage); stage transitions are the single progress source (frontend polls this).
- [x] `GET /api/projects/:id/requirements`, `PUT /api/projects/:id/requirements` — persisted edits + explicit confirmation flag; PUT validates against the contracts schema; confirmation snapshot stored immutably for traceability.
- [x] Quotas: per-IP run caps (e.g., 10 runs/hour) via throttler config → `QUOTA_EXCEEDED`.

**B3 checkpoint**

- [x] Fake-provider e2e: create project → requirements run succeeds → stage rows recorded → requirements fetched → PUT confirms. Green.
- [x] Failure e2e: fake provider throwing invalid JSON twice → run fails with `GENERATION_REPAIR_FAILED` and an actionable error envelope; partial results never marked complete.
- [x] Restart test (integration): a run left `running` in DB flips to `interrupted` at boot; client-visible, retry allowed.
- [x] Guard + quota + validation envelope tests green.
- [x] Duration/usage persisted per run.

Status: Done — 2026-10-23.

---

## Phase B4 — Canonical architecture generation

**Goal**: confirmed spec → one validated cross-layer model, in two real phases, with bounded repair.

- [x] **Canonical model schema finalization** (contracts): requirements snapshot + traceability; LLD (classes/interfaces/abstract/enums/value objects, attributes, methods, invariants, requirement refs, rationale, alternatives; relationships with kind + multiplicity; patterns with participants/benefits/drawbacks/simpler-alternative/when-unnecessary); HLD (typed components, directed labelled connections with kind sync/async/data, flows with ordered steps + element refs, technology decisions with why/limits/alternatives, scalability notes, failure scenarios with conditions/impact/mitigation/trade-off); DSA (operation-scoped recommendations with structure/algorithm, avg/worst wording, layer badge, assumptions, alternatives, limitations; algorithmic patterns separate from OO patterns); learning steps with resolved element refs.
- [x] **Two-phase orchestrator** (each phase = one provider call, separate stage rows):
  - Phase A `hld_model`: HLD + tech decisions + flows + bottlenecks from confirmed spec.
  - Phase B `lld_dsa_model`: LLD + patterns + DSA + learning steps, with Phase A output pinned as context.
  - Merge into one `ArchitectureModel`; a failed phase fails its stage only; other phase's validated result is persisted and reusable (retry semantics without rerunning what succeeded).
- [x] **Structural validator**: schema/types; unique IDs (per collection, prefix-validated e.g. `cls_`, `rel_`, `cmp_`, `conn_`, `flow_`, `dsa_`, `step_`); valid relationship endpoints + type/multiplicity compatibility matrix (e.g., realization → interface only; inheritance source/target class-or-abstract); no self-connections in HLD; flow step refs and connection refs valid; learning refs valid; required fields; complexity string presence.
- [x] **Semantic checks (warnings)**: every `Must` FR referenced by ≥1 element or flagged; NFR measurable-target presence; class-name duplicates; minimal sanity (≥1 class, ≥1 component, ≥1 connection); empty pattern lists allowed (patterns only when justified).
- [x] **Bounded repair**: max 2 attempts, prompt contains only the failing rule list + failing subtree context; blocking validation failure after repairs → `GENERATION_REPAIR_FAILED` with per-rule messages; warnings never block (returned with version, surfaced to frontend).
- [x] **Versioning + scoped regeneration**: every success writes an `architecture_versions` row; project points at current; `POST /api/projects/:id/architecture/regenerate` accepts `scope: lld|hld|dsa` and regenerates only that section against pinned untouched sections, with validation guaranteeing preserved IDs where safe.
- [x] Requirement-history awareness: when confirmed specs change, regeneration gets the previous version + spec diff summary; full correctness is re-established by validation, not assumed.

**B4 checkpoint**

- [ ] Unit tests: every structural rule, every warning rule, multiplicity matrix, repair-loop success-after-failure and double-failure paths. Core rules and the multiplicity matrix are covered; exhaustive per-rule coverage is still open.
- [x] Fake-provider e2e: confirm spec → two-phase run → version persisted → architecture fetched → warnings surfaced.
- [x] Scoped-regeneration drift test: regenerate `dsa` only → LLD/HLD sections byte-identical to previous version.
- [x] Cross-layer traceability spot-check: each Must FR maps to ≥1 element or a warning explanation (fixture-driven).
- [ ] Live smoke (manual, GLM-5.3 Flash): one small system generates a fully valid end-to-end model; record token usage + duration in run rows. Requirements and HLD succeeded live; LLD/DSA retry pending after the reasoning/truncation fix.

Status: Implemented — exhaustive per-rule tests and live end-to-end smoke pending.

---

## Phase B5 — Hardening, observability, and failure matrix

**Goal**: degrade gracefully under every failure listed in the spec, cheaply and observably.

- [x] Failure matrix tests (fake provider injects behavior): rate limit (with `Retry-After` honored in error payload), auth failure, timeout mid-request, malformed JSON, empty output, oversized output, `context_length` — each mapped to registered codes with an actionable `message`. `retryAfterSeconds` is supplied when the provider gives it; retry decisions stay with the caller.
- [x] Payload hygiene: request size limits enforced, oversized model outputs rejected with `INVALID_MODEL_OUTPUT` (`output_too_large`), raw outputs never stored or logged in full.
- [x] Database failure translation → `DATABASE_UNAVAILABLE` (503) envelope; the exception-filter test feeds a real connection error.
- [x] Observability: per-run duration (from timestamps), token usage, retry counts, stage timestamps, validation warning list — all persisted; no sensitive content.
- [x] Concurrency guard: overlapping generation for the same project → `RUN_CONFLICT`; worker idempotency for double-POST.
- [x] Rate-limit tuning notes + `MOCK_PROVIDER` guard (only active when explicitly enabled).
- [x] Docs sync: update [[Tech-Stack]], planners' statuses, and generate the `docs/` living documentation set (Home, Architecture, API, Data-Model, Generation, Providers, Testing) once the MVP milestone lands — per the living-documentation rule.

**B5 checkpoint**

- [x] Full backend test suite green (`test`, `test:e2e`) including every failure-matrix case.
- [x] `RUN_CONFLICT` + double-submit scenario tested.
- [x] Run metrics visible in DB for a completed fake-run.
- [x] `DATABASE_UNAVAILABLE` behavior verified.
- [ ] READMEs replaced with real run/debug instructions for both apps. Backend README is done; the frontend README belongs to the frontend track.

Status: Backend complete — full frontend README remains with the frontend track.

---

## Interfaces the frontend can rely on

| Method + path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness, enveloped. |
| `GET /api/providers` | Provider metadata + current model info. |
| `POST /api/projects` | Create project from idea (+ access key once). |
| `GET /api/projects/:id` | Project state. |
| `POST /api/projects/:id/requirements` | Start requirements generation run. |
| `GET /api/projects/:id/requirements` | Current editable spec + assumptions/questions. |
| `PUT /api/projects/:id/requirements` | Save/confirm edited spec. |
| `POST /api/projects/:id/architecture` | Start two-phase architecture run. |
| `GET /api/projects/:id/architecture` | Current model + validation report + warnings. |
| `POST /api/projects/:id/architecture/regenerate` | Scoped LLD/HLD/DSA regeneration. |
| `GET /api/runs/:runId` | Run status, real stages, usage, errors. |

All responses enveloped; provider key via `x-provider-api-key`; project access via `x-project-key`.

## Deliberately out of backend scope (MVP)

Groq/Gemini adapters (interface ready, not built), Redis/BullMQ, multi-instance workers, hosted-key vault, full user auth, streaming/SSE (polling suffices at MVP scale), Supabase migration, section-diff auto-repair beyond scoped regeneration. Real-Postgres integration run is an optional flag, required before-public-beta.

Related: [[Home]] · [[Project-Overview]] · [[Tech-Stack]] · [[Roadmap-Planner-Frontend]]
