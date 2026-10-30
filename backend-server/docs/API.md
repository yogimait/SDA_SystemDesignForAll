# API

Base URL: `http://localhost:3001/api`. Every JSON response uses the shared envelope from `@sda/contracts`; there are no bare objects or arrays.

## Envelope

Success:

```json
{ "status": true, "statusCode": 200, "data": {} }
```

Failure:

```json
{
  "status": false,
  "statusCode": 409,
  "message": "A generation run is already active for this project. Wait for it to finish.",
  "error": { "code": "RUN_CONFLICT" }
}
```

`statusCode` always matches the HTTP status. `error.details` is optional.

## Headers

| Header | Required | Meaning |
| --- | --- | --- |
| `Authorization` | Auth, account, dashboard, project list, and owner access | `Bearer <accessToken>` from register/login. |
| `x-project-key` | Anonymous or shared project routes; optional for an owned project with Bearer | Access key returned once by `POST /api/projects`. |
| `x-provider-api-key` | Real provider runs | BYOK provider key; held in memory for the run only. Not required with `MOCK_PROVIDER=1`. |

The provider key must never be put in URLs, query strings, logs, or persisted data.

Unknown API routes return a 404 envelope with `ROUTE_NOT_FOUND`. Responses set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Content-Security-Policy`, and a restrictive `Permissions-Policy`; Express `X-Powered-By` is disabled.

## Endpoints

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 200 | Liveness + active database driver. |
| `GET` | `/api/providers` | 200 | Provider metadata with per-provider model catalogs, default provider/model, mock flag. |
| `POST` | `/api/auth/register` | 201 | Create an account and return a Bearer session. |
| `POST` | `/api/auth/login` | 200 | Authenticate and return a Bearer session. |
| `GET` | `/api/auth/me` | 200 | Current user. |
| `POST` | `/api/auth/logout` | 200 | Revoke the current Bearer session. |
| `POST` | `/api/projects` | 201 | Create a project; owner set when Bearer is present. Returns the access key once. |
| `GET` | `/api/projects` | 200 | List the authenticated user's projects; cursor, limit, status. |
| `GET` | `/api/projects/:id` | 200 | Project state; owner Bearer or project key. |
| `GET` | `/api/provider-config` | 200 | Saved provider/model selection (non-secret). |
| `PUT` | `/api/provider-config` | 200 | Save provider/model/reasoning selection; rejects API keys. |
| `GET` | `/api/preferences` | 200 | Theme and default provider/model preferences. |
| `PUT` | `/api/preferences` | 200 | Merge user preferences. |
| `GET` | `/api/billing/plans` | 200 | Plan catalogue and active billing provider. |
| `GET` | `/api/billing/subscription` | 200 | Current subscription and plan tier. |
| `POST` | `/api/billing/checkout` | 201 | Start a Pro checkout (Stub or Stripe). |
| `POST` | `/api/billing/checkout/:id/complete` | 200 | Stub-only development completion. |
| `POST` | `/api/billing/portal` | 200 | Billing portal URL. |
| `POST` | `/api/billing/cancel` | 200 | Cancel the subscription. |
| `POST` | `/api/billing/webhook` | 200 | Stripe webhook; signature verified, idempotent. |
| `POST` | `/api/auth/verify-email` | 200 | Consume an email verification token. |
| `POST` | `/api/auth/resend-verification` | 200 | Issue a new verification token. |
| `POST` | `/api/auth/forgot-password` | 200 | Always 200; queues a reset link. |
| `POST` | `/api/auth/reset-password` | 200 | Consume a reset token; revoke sessions. |
| `POST` | `/api/auth/refresh` | 200 | Rotate the refresh cookie; new Bearer session. |
| `DELETE` | `/api/users/me` | 200 | Password-confirmed account deletion. |
| `GET` | `/api/dev/outbox` | 200 | Development-only email links; 404 in production. |
| `GET` | `/api/dashboard` | 200 | Usage totals, daily buckets, top models, recent runs. |
| `POST` | `/api/projects/:id/requirements` | 202 | Start a requirements generation run. |
| `GET` | `/api/projects/:id/requirements` | 200 | Current editable spec + confirmation timestamp. |
| `PUT` | `/api/projects/:id/requirements` | 200 | Save edits; optionally confirm and snapshot. |
| `POST` | `/api/projects/:id/architecture` | 202 | Start the two-phase architecture run. |
| `POST` | `/api/projects/:id/architecture/regenerate` | 202 | Regenerate one section (`hld`, `lld`, or `dsa`). |
| `GET` | `/api/projects/:id/architecture` | 200 | Current architecture version + validation report. |
| `GET` | `/api/runs/:runId` | 200 | Run status, ordered stages, usage, errors. |
| `GET` | `/api/runs/:runId/events` | 200 | SSE live/replayed run and stage events. |
| `GET` | `/api/runs/:runId/events?lastEventId=...` | 200 | SSE reconnect fallback when `Last-Event-ID` cannot be sent. |

Run-start endpoints are throttled per IP (`THROTTLE_LIMIT` per `THROTTLE_TTL_MS`). Exceeding the window returns `429 QUOTA_EXCEEDED`.

## List providers

`GET /api/providers` is public and returns no secrets. Catalogs come from `OPENROUTER_MODELS` / `GROQ_MODELS`, never from a provider API call. `mock: true` still lists both providers; only generation is mocked.

```json
{
  "status": true,
  "statusCode": 200,
  "data": {
    "providers": [
      {
        "id": "openrouter",
        "models": ["z-ai/glm-5.3-flash", "anthropic/claude-sonnet-4.5"],
        "supportsStructuredOutput": true
      },
      {
        "id": "groq",
        "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
        "supportsStructuredOutput": true
      }
    ],
    "defaultProvider": "openrouter",
    "defaultModel": "z-ai/glm-5.3-flash",
    "mock": false
  }
}
```

`defaultModel` is a suggestion, not a whitelist: `POST` run bodies may name any model the key can access. `models[]` drives the client dropdown only.

## Create a project

```http
POST /api/projects
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "idea": "A collaborative workspace for small teams." }
```

```json
{
  "status": true,
  "statusCode": 201,
  "data": {
    "project": {
      "id": "uuid",
      "idea": "A collaborative workspace for small teams.",
      "ownerId": "usr_...",
      "status": "requirements_pending",
      "createdAt": "2026-10-23T00:00:00.000Z",
      "updatedAt": "2026-10-23T00:00:00.000Z",
      "confirmedAt": null,
      "currentArchitectureVersion": null
    },
    "accessKey": "one-time-256-bit-key"
  }
}
```

Project creation requires a signed-in session (`401 AUTH_REQUIRED` without
one) and always sets `ownerId`, so plan limits apply to every project. The
idea is trimmed and limited to 8000 characters. Store the access key
client-side; it cannot be retrieved again. Anonymous creation is gone;
pre-existing anonymous rows (if any) stay readable through their
`x-project-key` — the guard keeps that path for backwards compatibility.

## Authentication

```http
POST /api/auth/register
Content-Type: application/json

{ "email": "user@example.com", "password": "password123" }
```

Returns:

```json
{
  "user": {
    "id": "usr_...",
    "email": "user@example.com",
    "planTier": "free",
    "emailVerifiedAt": null,
    "createdAt": "2026-10-27T00:00:00.000Z",
    "updatedAt": "2026-10-27T00:00:00.000Z"
  },
  "accessToken": "opaque-session-token",
  "tokenType": "Bearer",
  "expiresAt": "2026-10-27T00:15:00.000Z"
}
```

The response also sets two cookies: `sda_refresh` (httpOnly, `SameSite=Strict`, `Secure` in production, `path=/api/auth`) and `sda_csrf` (readable, double-submit nonce). Access tokens are short lived (`ACCESS_TOKEN_TTL`, default 15m); the refresh token lasts `REFRESH_TOKEN_TTL` (default 30d). See [[Auth]] for the full flow.

Send `Authorization: Bearer <accessToken>` to `GET /api/auth/me`, `POST /api/auth/logout`, project list/owner access, provider config, preferences, dashboard, and billing routes. Passwords are stored as scrypt hashes with per-password salt; access, refresh, verification, and reset tokens are stored only as SHA-256 hashes. Unknown-email login performs a dummy scrypt verification so timing does not reveal whether the account exists.

### Refresh, CSRF, and token flows

- `POST /api/auth/refresh` has no body: it reads the refresh cookie, checks `Origin` against `CORS_ORIGIN` and `x-csrf-token` against the CSRF cookie, rotates the refresh token, and returns a new `AuthResponse`. Reusing a rotated cookie revokes the whole family and returns 401 `AUTH_INVALID_CREDENTIALS` with `details.reason = "reuse"`.
- `POST /api/auth/logout` deletes the access session and revokes the refresh family, then clears both cookies. A Bearer token, or a refresh cookie plus `x-csrf-token`, is enough; a request with neither is 401. The dev outbox stores usable links outside production; in production the link is stored without its token and the route is a 404.
- `POST /api/auth/verify-email { token }` consumes a single-use token; `POST /api/auth/resend-verification` (Bearer) issues a new one.
- `POST /api/auth/forgot-password { email }` always returns 200. `POST /api/auth/reset-password { token, password }` consumes the token, replaces the hash, and deletes all sessions and refresh tokens for the user.
- CSRF or Origin failures are `400 VALIDATION_ERROR` with `details.reason = "csrf_invalid"` or `"origin_not_allowed"`. Auth-throttle rejections are `429 QUOTA_EXCEEDED` with a `Retry-After` header.
- Without SMTP, links land in the development outbox: `GET /api/dev/outbox` lists the last 50 messages. The route is a 404 in production.
- `REQUIRE_EMAIL_VERIFICATION=1` makes project creation and every run start return 401 `AUTH_REQUIRED` with `details.reason = "email_not_verified"` until the address is confirmed.
- `DELETE /api/users/me { password }` deletes the account. Owned projects keep working through their `x-project-key` with `ownerId: null`; sessions, tokens, configs, preferences, subscriptions, and billing events cascade.

### Billing

`GET /api/billing/plans` is public. The remaining billing routes need a Bearer token; the webhook needs a valid Stripe signature. `POST /api/billing/checkout { "plan": "pro" }` returns `{ checkoutId, url, provider }`. With the default stub provider, `POST /api/billing/checkout/:id/complete` (non-production only) activates Pro locally. With `STRIPE_SECRET_KEY` set, Stripe hosts checkout and the portal, and `POST /api/billing/webhook` applies subscription events exactly once. `POST /api/billing/cancel` downgrades immediately on the stub and sets `cancel_at_period_end` on Stripe. Production with the stub provider reports `checkoutCompletable: false` and `POST /api/billing/checkout` returns 502 `PROVIDER_UNAVAILABLE`. See [[Billing]].

`POST /api/projects` requires a Bearer session and always sets `ownerId`. Pre-existing anonymous rows (if any) remain accessible with their `x-project-key`. An owner can use a Bearer token without the project key. A valid Bearer session for a non-owner gets the same `PROJECT_NOT_FOUND` 404 as an unknown project.

`GET /api/projects?limit=20&status=architecture_ready&cursor=...` returns owned projects only. Cursor values are opaque; malformed cursors are `VALIDATION_ERROR`.

## Provider config and preferences

```http
PUT /api/provider-config
Authorization: Bearer <token>
Content-Type: application/json

{ "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "reasoningEffort": "low" }
```

No API key is accepted or persisted here. BYOK remains per-run through `x-provider-api-key`. Requests containing unexpected body keys — an `apiKey` for example — fail with `VALIDATION_ERROR` (the request schema is strict) rather than silently dropping the field. `GET` without a saved config returns `PROVIDER_CONFIG_NOT_FOUND`. The same routes are also available under `/api/users/me/provider-config` and `/api/users/me/preferences`. Path parameters enforce the id shape: a malformed project or run id is a `PROJECT_NOT_FOUND` / `RUN_NOT_FOUND` 404 envelope, not a database 500.

`PUT /api/preferences` accepts optional `theme`, `defaultProvider`, `defaultModel`, and `defaultReasoningEffort`; omitted fields keep their current values. `GET /api/preferences` returns `{ "preferences": {} }` before the first save.

## Dashboard and plans

`GET /api/dashboard?range=last_7_days|last_30_days|last_90_days` aggregates only projects owned by the authenticated user. It returns usage totals, daily buckets, top models, and recent runs.

Plan limits use existing error codes:

- Free: 3 projects, 50 runs per 30 days, 500k tokens per 30 days.
- Pro: 100 projects, 1,000 runs per 30 days, 10M tokens per 30 days.
- Scoped regeneration requires Pro for owned projects (`PLAN_UPGRADE_REQUIRED`).
- Owned-project generation counts against the owner's plan whether access uses Bearer or `x-project-key`.

## Start a run

```http
POST /api/projects/:id/requirements
x-project-key: <key>
Content-Type: application/json

{}
```

The body is optional. It may select a provider/model for this run:

```json
{ "provider": "openrouter", "model": "z-ai/glm-5.3-flash" }
```

The response is always the queued run id:

```json
{ "status": true, "statusCode": 202, "data": { "runId": "uuid" } }
```

Starting architecture generation requires a confirmed requirements snapshot. Starting any run while another is queued or running for the same project returns `RUN_CONFLICT`.

## Save and confirm requirements

```http
PUT /api/projects/:id/requirements
x-project-key: <key>
Content-Type: application/json

{
  "functional": [
    { "id": "fr_existing", "text": "Users can organize items.", "priority": "must" }
  ],
  "nonFunctional": [
    {
      "id": "nfr_existing",
      "text": "Reads stay fast.",
      "priority": "should",
      "category": "performance",
      "target": "p95 under 200 ms"
    }
  ],
  "assumptions": [],
  "clarifications": [
    { "id": "q_existing", "question": "Per-item sharing?", "answer": "Yes." }
  ],
  "confirm": true
}
```

- Existing items keep their ids; new items omit `id` and receive a prefixed server id.
- Duplicate ids are rejected. Requirement, assumption, and clarification ids are a global namespace; reusing an id from another project returns `VALIDATION_ERROR` 400.
- `confirm: true` freezes a snapshot in `projects.requirements_snapshot`; architecture generation reads that snapshot.
- Saving with `confirm: false` clears the snapshot and returns the project to `requirements_ready`, so architecture generation must be started again after reconfirmation.

## Regenerate a section

```http
POST /api/projects/:id/architecture/regenerate
x-project-key: <key>
Content-Type: application/json

{ "scope": "dsa" }
```

`scope` is required: `hld`, `lld`, or `dsa`. The other sections are pinned from the current version. Learning-step references to removed elements are pruned; if every learning step would disappear, the regeneration fails with `GENERATION_REPAIR_FAILED`.

## Read the architecture

`GET /api/projects/:id/architecture` returns `{ "version": null }` before the first successful generation. Otherwise:

```json
{
  "status": true,
  "statusCode": 200,
  "data": {
    "version": {
      "id": "uuid",
      "projectId": "uuid",
      "version": 1,
      "createdAt": "2026-10-23T00:00:00.000Z",
      "model": {},
      "validation": {
        "valid": true,
        "errors": [],
        "warnings": [],
        "validatedAt": "2026-10-23T00:00:00.000Z"
      }
    }
  }
}
```

The `model` is the canonical `ArchitectureModel` from `@sda/contracts`: requirements snapshot, LLD, HLD, DSA, and learning steps. Client-side export/PDF uses `GET /api/projects/:id` plus this response; no server-side PDF renderer or export endpoint is provided.

## Poll a run

```http
GET /api/runs/:runId
x-project-key: <key>
```

Stages are ordered and reflect persisted `generation_stages` rows only. No stage is simulated. Usage reported for a failed run includes tokens consumed by the failed provider call, so plan accounting and dashboard totals count failed generation attempts.

```json
{
  "status": true,
  "statusCode": 200,
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "type": "requirements",
    "status": "succeeded",
    "provider": "openrouter",
    "model": "z-ai/glm-5.3-flash",
    "scope": null,
    "stages": [
      {
        "name": "analyze_idea",
        "status": "succeeded",
        "attempt": 1,
        "startedAt": "2026-10-23T00:00:01.000Z",
        "finishedAt": "2026-10-23T00:00:05.000Z",
        "error": null,
        "usage": { "promptTokens": 120, "completionTokens": 240, "totalTokens": 360 }
      }
    ],
    "error": null,
    "usage": { "promptTokens": 120, "completionTokens": 240, "totalTokens": 360 },
    "createdAt": "2026-10-23T00:00:00.000Z",
    "startedAt": "2026-10-23T00:00:01.000Z",
    "finishedAt": "2026-10-23T00:00:05.000Z"
  }
}
```

Terminal statuses are `succeeded`, `failed`, and `interrupted`. A failed run carries `error.code`, `error.message`, and optional safe `error.details`; the failing stage carries the same error.

## Stream a run

```http
GET /api/runs/:runId/events
x-project-key: <key>
Accept: text/event-stream
```

The response is `text/event-stream` and uses the same project-key or owner Bearer access as `GET /api/runs/:runId`. On connect it replays all persisted stages in order and then the current run state. Live events follow until a terminal run state, then the connection closes.

```text
id: stage:analyze_idea:running:0
event: stage
data: {"type":"stage","name":"analyze_idea","status":"running","attempt":0,"startedAt":"2026-10-28T00:00:00.000Z","finishedAt":null,"error":null,"usage":null}

id: run:succeeded
event: run
data: {"type":"run","status":"succeeded","error":null,"usage":{"promptTokens":120,"completionTokens":240,"totalTokens":360},"updatedAt":"2026-10-28T00:00:10.000Z"}
```

- Reconnect with the standard `Last-Event-ID` header; it is resolved against persisted state, not an in-memory event buffer. `?lastEventId=<id>` is also accepted for clients that cannot set the header.
- A comment heartbeat (`: heartbeat`) is sent every 10 seconds. It carries no `id`, `event`, or `data`, so it cannot affect frame order or `Last-Event-ID`.
- `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no` are set.
- Polling `GET /api/runs/:runId` remains available and reports the same stage sequence.
- The event bus is single-instance only; multi-instance deployments require a shared pub/sub layer.

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Request or domain input failed validation. |
| `ROUTE_NOT_FOUND` | 404 | Unknown route. |
| `PROJECT_NOT_FOUND` | 404 | Project does not exist. |
| `PROJECT_ACCESS_DENIED` | 403 | Missing/wrong project key. |
| `AUTH_REQUIRED` | 401 | Missing, invalid, expired, or revoked Bearer session; also the unverified-email gate. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login email/password mismatch; also invalid, expired, or reused tokens. |
| `AUTH_EMAIL_TAKEN` | 409 | Registration email already exists. |
| `USER_NOT_FOUND` | 404 | Requested user does not exist. |
| `RUN_NOT_FOUND` | 404 | Run does not exist. |
| `RUN_CONFLICT` | 409 | A run is already queued or running for the project. |
| `PAYLOAD_TOO_LARGE` | 413 | JSON body exceeds `MAX_REQUEST_BYTES`. |
| `QUOTA_EXCEEDED` | 429 | Per-IP run-start or auth throttle hit. |
| `PLAN_LIMIT_EXCEEDED` | 402 | Project/run/token allowance exceeded. |
| `PLAN_UPGRADE_REQUIRED` | 402 | Feature requires Pro. |
| `PROVIDER_CONFIG_NOT_FOUND` | 404 | No saved provider configuration. |
| `PROVIDER_AUTH_FAILED` | 502 | Provider rejected the key. |
| `PROVIDER_RATE_LIMITED` | 429 | Provider rate limit; may carry `retryAfterSeconds`. |
| `PROVIDER_TIMEOUT` | 504 | Provider did not answer in time. |
| `PROVIDER_UNAVAILABLE` | 502 | Network or provider 5xx failure. |
| `PROVIDER_UNSUPPORTED_CAPABILITY` | 502 | Rejected capability, context length, or unsupported structured output. |
| `INVALID_MODEL_OUTPUT` | 502 | Non-JSON, malformed, empty, or oversized model output. |
| `GENERATION_REPAIR_FAILED` | 422 | Output stayed invalid after bounded repairs. |
| `DATABASE_UNAVAILABLE` | 503 | Database connection failure translated at the HTTP boundary. |
| `INTERNAL_ERROR` | 500 | Unexpected server failure; details are hidden. |

Codes are registered once in `packages/contracts/src/envelope.ts`; do not invent codes in controllers. Auth, CSRF, and billing failures carry a stable `error.details.reason` (`reuse`, `token_invalid`, `verification_invalid`, `reset_invalid`, `csrf_invalid`, `origin_not_allowed`, `email_not_verified`, `webhook_invalid`) so clients can distinguish causes without new codes.

Related: [[Home]] · [[Architecture]] · [[Generation]] · [[Data-Model]] · [[Providers]] · [[Auth]] · [[Billing]] · [[Testing]]
