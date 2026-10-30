# Testing

The backend uses Vitest for unit, integration, and e2e tests, plus oxlint type-aware for static checks. Tests run against in-memory PGlite and never call a real provider.

## Commands

| Command (in `backend-server/`) | What runs |
| --- | --- |
| `npm run build` | Builds `@sda/contracts`, then `nest build`. |
| `npm run lint` | Builds contracts, then oxlint over `src/` and `test/`. |
| `npm run test` | Builds contracts, then the unit/integration suite (`**/*.spec.ts`). |
| `npm run test:e2e` | Builds contracts, then the e2e suite (`**/*.e2e-spec.ts`). |
| `npm run test:cov` | Unit suite with coverage. |

Run all four checks before declaring backend work done:

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

## Test environment

| Variable | Test value | Why |
| --- | --- | --- |
| `NODE_ENV` | `test` | No development-only behavior. |
| `MOCK_PROVIDER` | `1` | Deterministic fixtures; no network. |
| `PGLITE_DATA_DIR` | `memory://` | Fresh database per app, no filesystem cleanup. |
| `GENERATION_POLL_INTERVAL_MS` | `10` | Fast worker polling. |
| `DEFAULT_MODEL` | `test/model` in e2e | Proves the model is configurable, not hardcoded. |
| `THROTTLE_LIMIT` | high except the throttle case | Avoids cross-test throttling. |
| `AUTH_THROTTLE_LIMIT` | `1000` | Same, for login/register/verification. |
| `REQUIRE_EMAIL_VERIFICATION` | `0` (one app uses `1`) | Proves the gate is opt-in. |

The auth throttle is env-driven (`AUTH_THROTTLE_LIMIT`, `AUTH_THROTTLE_TTL_MS`, default 5 per 60 s). Any long-running browser suite that registers repeatedly must set `AUTH_THROTTLE_LIMIT` in the backend process environment; the frontend Playwright `webServer` currently raises only `THROTTLE_LIMIT`.

Each e2e file builds its own Nest app with `configureApp()` and `app.init()`, so HTTP behavior cannot drift from `main.ts`. Some tests override `ProviderRegistry` with a scripted provider for blocking, invalid, and failure paths.

## Unit and integration coverage

| File | Focus |
| --- | --- |
| `config.spec.ts` | Defaults, coercion, model-catalog parsing (trim/dedupe/empty rejection), invalid port, Postgres URL requirement. |
| `access-key.spec.ts` | Key format, hash verification, wrong key, malformed hash. |
| `redact.spec.ts` | Key/value formats and bearer tokens; ordinary prose unchanged. |
| `redacting.logger.spec.ts` | Secrets are redacted before they reach the real log stream. |
| `zod-validation.pipe.spec.ts` | Transform output, `VALIDATION_ERROR` details. |
| `json-schema.spec.ts` | Keyword stripping, strict required/additionalProperties, non-strict mode. |
| `openrouter.provider.spec.ts` | Request shape, BYOK header, ladder fallback and caching, every normalized error branch (including context length and oversized output), tolerant extraction, usage. |
| `groq.provider.spec.ts` | Groq endpoint/request fields; strict-schema mismatch downgrades to json_object; prompt-mode mismatch is repairable `INVALID_MODEL_OUTPUT`. |
| `validator.spec.ts` | Structural errors, semantic warnings, section validators, learning-ref pruning. |
| `generators.spec.ts` | Repair exhaustion for requirements and HLD, success after one repair, HLD truncation compact retry at the 64k budget, bounded HLD truncation failure. |
| `failure-usage.spec.ts` | Usage extraction from failure details and nested `providerOutput`; non-errors ignored. |
| `all-exceptions.filter.spec.ts` | Envelope mapping, details, redaction, hidden 500 details, database/payload translation. |
| `api-response.interceptor.spec.ts` | Success wrapping and no double-wrap. |
| `database.repositories.spec.ts` | PGlite migrations, project/access, requirements replace, run claim/update/reconcile/HLD reuse, architecture versioning and uniqueness, JSONB round-trip, users/sessions/provider config/preferences/owned-project listing/dashboard source rows, refresh rotation, single-use verification/reset tokens, billing subscription upsert and event idempotency, user-delete cascades. |
| `auth.service.spec.ts` | Register/login/logout, normalized email, opaque hashed sessions, refresh rotation and reuse revocation, single-use reset/verification tokens, password-confirmed deletion, dummy verification for unknown email. |
| `billing.service.spec.ts` | Webhook idempotency, retry of an unprocessed event after a plan-update failure, concurrent-insert acknowledgement, checkout activation, subscription status transitions, unsigned-webhook rejection. |
| `outbox-email.spec.ts` | Development links keep the token; production links store `<redacted>`. |
| `password.service.spec.ts` | scrypt hash/verify, fresh salt, plaintext absence, valid dummy timing hash. |
| `plan.service.spec.ts` | Free project/run/token limits, Pro scoped-regeneration gate, anonymous no-op. |
| `dashboard.service.spec.ts` | Totals, daily buckets, top models, recent-run ordering. |
| `run-events.service.spec.ts` | Event-bus filtering/order, stable frame ids, persisted snapshot ordering, Last-Event-ID replay, terminal statuses, stale live-event suppression. |
| `run-stream-heartbeat.spec.ts` | SSE comment heartbeat cadence between frames, terminal close, no heartbeat on an already-terminal run. |
| `database.reopen.spec.ts` | File-backed PGlite reopen, idempotent migration re-run, and boot-time reconciliation of an interrupted run. |

The repository suite uses a real Drizzle + PGlite database, not mocks. It exercises the generated SQL migrations.

## E2e coverage

`test/app.e2e-spec.ts` runs the public HTTP surface with supertest. `test/auth.e2e-spec.ts` covers register/login/me/logout, normalized email, duplicate/invalid credentials, project ownership and listing cursor/status, anonymous legacy access, provider config without keys, preference merge, plan limits/upgrade-required, dashboard aggregation/validation, owner reopening a project with the Bearer token alone, complete client-export payloads and owner/key access, 404 envelopes for malformed project/run ids, cross-project requirement-id conflicts, and strict rejection of an `apiKey` in the provider-config save. `test/auth-hardening.e2e-spec.ts` covers email verification through the dev outbox, refresh rotation and reuse revocation, CSRF and Origin rejection, password reset single use, cookie-only logout, account deletion (project ownership nulled, key still works), and the `REQUIRE_EMAIL_VERIFICATION` gate. `test/billing.e2e-spec.ts` covers the plan catalogue, stub checkout ownership and completion, plan-tier change, cancel/downgrade, portal URL, unsigned webhook rejection, and unauthenticated access. `test/production-guards.e2e-spec.ts` covers the production 404 for the outbox and the disabled stub checkout. `test/auth-throttle.e2e-spec.ts` covers `Retry-After` on the auth 429. Manual mock-mode verification uses `MOCK_PROVIDER=1` and the same HTTP surface.

E2e files run one at a time (`fileParallelism: false`) because every app boots a WASM Postgres; parallel files exhausted memory on dev machines.

- health and provider metadata envelopes, including both provider model catalogs and their schema shape;
- security headers and unknown-route `ROUTE_NOT_FOUND`;
- project creation, validation error, payload limit, missing/wrong access key;
- requirements generation, persisted stages, usage, spec, confirmation;
- architecture generation, four stages, version 1, validation report;
- scoped DSA regeneration, version 2, untouched HLD/LLD byte-identical serialized JSON;
- architecture start before confirmation;
- run polling guard and unknown run;
- SSE replay/live stage frames, terminal frame and close, Last-Event-ID replay, polling/stream stage parity, and stream auth failures;
- `RUN_CONFLICT` for a second run and for two simultaneous starts;
- exhausted schema repair and exhausted invalid-JSON repair;
- failed-call provider usage persisted on both the run and the failed stage;
- per-IP throttle returning `QUOTA_EXCEEDED` (auth throttle additionally asserts `Retry-After`).

## What is not automated

- Real OpenRouter calls: the adapter is contract-tested with a mocked fetch, and the model slug/capabilities were verified against OpenRouter's model list. A full live architecture smoke is still manual.
- Real Postgres: the same migrations and repositories are used, but only PGlite runs in CI. Before public beta, run the optional integration against a real Postgres instance.
- Process restart: startup reconciliation is exercised through `reconcileInterrupted()` and app boot; a full OS-level restart test is not automated.
- Log capture: redaction is unit-tested; a capture-the-log-stream integration test is not present.
- Email delivery: only the local outbox is implemented and tested. No SMTP provider is wired, so real delivery is untested.
- Live Stripe: the REST adapter and signature verification are implemented, but tests use a scripted provider. Card charges, portal sessions, and webhook delivery from Stripe are unverified.

## Manual live smoke

```powershell
$env:DATABASE_DRIVER = "pglite"
$env:MOCK_PROVIDER = "0"
$env:DEFAULT_MODEL = "z-ai/glm-5.3-flash"
npm run start:dev
```

Then create a project and start requirements with a real `x-provider-api-key`, poll the run, confirm the spec, and start architecture. Verify:

- run stages become `succeeded` in order;
- `usage.promptTokens` / `completionTokens` are non-zero;
- the architecture version has `validation.valid = true`;
- warnings are shown but do not block;
- the provider key never appears in server logs or the database.

Never commit a real key or paste it into test fixtures.

## Adding tests

- Put unit/integration tests in `test/unit/*.spec.ts`; e2e tests in `test/*.e2e-spec.ts`.
- Use the mock provider for normal generation; use a scripted provider for failure paths.
- Assert the envelope, not raw Nest responses.
- For new database behavior, extend `database.repositories.spec.ts` rather than mocking Drizzle.
- For new provider behavior, extend `openrouter.provider.spec.ts` with a scripted fetch.

Related: [[Home]] · [[Architecture]] · [[Generation]] · [[Providers]] · [[Auth]] · [[Billing]]
