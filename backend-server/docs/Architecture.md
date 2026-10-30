# Architecture

The backend is one NestJS process with an in-process generation worker. Persistence and model access sit behind interfaces so drivers and vendors can change without touching orchestration.

## Module map

```mermaid
flowchart TB
  subgraph API
    HC[Health]
    AC[Auth]
    ACC[Account]
    DASH[Dashboard]
    PC[Projects]
    RC[Requirements]
    ARC[Architecture]
    RNC[Run polling]
    SSE[Run SSE]
    PRC[Providers]
    BIL[Billing]
  end

  subgraph Common
    ENV[Envelope interceptor]
    ERR[Exception filter]
    GUARD[Project access guard]
    PIPE[Zod validation pipe]
    LOG[Redacting logger]
  end

  subgraph Domain
    RS[Run service]
    RQ[Requirements generator]
    AG[Architecture generator]
    AV[Validator]
    WK[Generation worker]
    RE[Run events bus]
  end

  subgraph Infrastructure
    REG[Provider registry]
    OR[OpenRouter adapter]
    MOCK[Mock provider]
    REPO[Repository interfaces]
    DB[(PGlite / Postgres)]
  end

  API --> Common
  API --> Domain
  Domain --> Infrastructure
  REPO --> DB
  WK --> RQ
  WK --> AG
  WK --> AV
  REG --> OR
  REG --> MOCK
```

| Location | Responsibility |
| --- | --- |
| `src/common/` | Envelope interceptor and exception filter, error registry mapping, Zod pipe, access guard, access-key service, redaction. |
| `src/config/` | Zod-validated environment; single source of `process.env` reads. |
| `src/database/` | `DatabaseService`, Drizzle schema, migrations, repository interfaces and implementations. |
| `src/providers/` | `ModelProvider` boundary, registry, OpenRouter adapter, mock provider, schema sanitizer, prompts. |
| `src/generation/` | Run service, DB-backed worker, requirements and architecture generators, run DTO mapping, process-local run event bus, SSE framing. |
| `src/projects/`, `src/requirements/`, `src/architecture/` | HTTP controllers and domain services. |
| `src/auth/` | Register/login/refresh/logout, scrypt password hashing, opaque access sessions, rotating refresh cookies, CSRF/Origin checks, email verification and reset tokens, dev outbox, account deletion. |
| `src/billing/` | Plan catalogue endpoint, subscription state, stub and Stripe providers, idempotent webhook handling. |
| `src/account/` | Saved provider config and user preferences. |
| `src/analytics/` | Dashboard range aggregation. |
| `src/plans/` | Free/Pro limits (from `PLAN_CATALOG`) and scoped-regeneration gate. |
| `src/common/access/auth-context.service.ts` + `auth.guard.ts` | Bearer resolution, required/optional auth guards, request user context. |
| `src/common/access/auth-throttler.guard.ts` | Config-driven per-IP throttle for auth endpoints. |
| `src/common/access/verified-email.guard.ts` | Optional email-verification gate for project creation and run starts. |
| `src/architecture/validator.ts` | Structural and semantic validation of the merged canonical model. |
| `packages/contracts/` | Zod schemas, DTO types, error-code registry, envelope helpers. |

## Request lifecycle

```mermaid
sequenceDiagram
  participant C as Client
  participant E as Express body parser
  participant A as AuthGuard / OptionalAuthGuard
  participant G as ProjectAccessGuard
  participant T as ThrottlerGuard
  participant Z as ZodValidationPipe
  participant S as Service
  participant I as Success interceptor
  C->>E: request + JSON body
  E->>A: parse body
  A->>A: resolve Bearer token (required/optional)
  A->>G: request.user
  G->>G: project key, or owner Bearer
  G->>T: (run-start routes only)
  T->>Z: limit passed
  Z->>S: typed DTO
  S-->>I: payload or AppError
  I-->>C: { status, statusCode, data }
```

Failures bypass the success interceptor and are normalized by `AllExceptionsFilter` into `{ status: false, statusCode, message, error: { code, details? } }`. The `statusCode` in the body always equals the HTTP status.

## Access control

- `POST /api/projects` returns a 256-bit random Base64URL access key once.
- Only its SHA-256 hex hash is stored in `project_access`.
- Every project-scoped route, `GET /api/runs/:runId`, and `GET /api/runs/:runId/events` accepts `x-project-key` or an owner Bearer session.
- Verification uses `timingSafeEqual`.
- The guard strips the stored hash before exposing the project to controllers.

Run polling resolves the run first, then checks the key against that run's project. A run id cannot be enumerated without a valid key; an unknown run returns `RUN_NOT_FOUND`.

Run SSE uses the same guard. The controller writes raw `text/event-stream` frames outside the JSON envelope: it replays persisted stage rows and the current run state, then forwards live events from the process-local `RunEventsService`. Heartbeats are comments; terminal run frames close the response. This bus is single-instance only; multi-instance deployments need a shared pub/sub layer.

## Configuration

`loadConfig()` validates `process.env` with Zod at module creation and refuses to boot on invalid values. `DATABASE_DRIVER=postgres` requires `DATABASE_URL`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins. |
| `DATABASE_DRIVER` | `pglite` | `pglite` or `postgres`. |
| `PGLITE_DATA_DIR` | `.data/pglite` | PGlite directory; `memory://` in tests. |
| `DATABASE_URL` | — | Required for Postgres. |
| `GENERATION_CONCURRENCY` | `1` | Reserved; the worker is single-run. |
| `GENERATION_POLL_INTERVAL_MS` | `100` | Worker polling cadence. |
| `MOCK_PROVIDER` | `0` | Explicit deterministic mock provider. |
| `DEFAULT_PROVIDER` | `openrouter` | Provider when the request omits one. |
| `DEFAULT_MODEL` | `z-ai/glm-5.3-flash` | Model when the request omits one. |
| `MAX_REQUEST_BYTES` | `1000000` | JSON body limit. |
| `THROTTLE_LIMIT` | `10` | Run-start requests per IP per window. |
| `THROTTLE_TTL_MS` | `3600000` | Throttle window. |
| `ACCESS_TOKEN_TTL` | `15m` | Bearer session lifetime. |
| `REFRESH_TOKEN_TTL` | `30d` | Refresh cookie rotation lifetime. |
| `REQUIRE_EMAIL_VERIFICATION` | `0` | Gate project creation and generation on a verified email. |
| `APP_BASE_URL` | `http://localhost:3000` | Email links and stub billing URLs. |
| `CSRF_SECRET` | — | Optional HMAC key for the CSRF cookie. |
| `AUTH_THROTTLE_LIMIT` | `5` | Auth endpoint budget per window. |
| `AUTH_THROTTLE_TTL_MS` | `60000` | Auth throttle window. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` | — | Enable the Stripe billing provider; empty means the local stub. |

No `.env` loader is installed: set environment variables in the shell or the process manager. This keeps secrets out of the repository and makes deployment configuration explicit.

## Deliberate boundaries

- No React Flow or rendering concerns in the backend; it returns the canonical model only.
- No Redis, BullMQ, or multi-instance worker in the MVP. The database queue is claimed by one in-process worker.
- Repository interfaces keep PGlite and Postgres interchangeable. No SQL leaks into controllers or generators.
- Provider adapters are created only through `ProviderRegistry`; orchestration never imports OpenRouter directly.
- The Express adapter is constructed explicitly in `main.ts` so production boot does not depend on Nest's optional platform discovery under npm workspace hoisting.
- The mock provider is active only when `MOCK_PROVIDER=1` is explicitly set.

Related: [[Home]] · [[API]] · [[Data-Model]] · [[Generation]] · [[Providers]] · [[Auth]] · [[Billing]] · [[Testing]]
