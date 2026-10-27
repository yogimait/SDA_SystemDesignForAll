# API Client

`lib/api/client.ts` — the only place frontend code calls the backend.

## Contract

- Base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`), documented in `.env.example`.
- Every call goes through `apiFetch(path, options)`; it validates the response against `@sda/contracts`:
  - success `{ status: true, statusCode, data }` → returns `data` (optionally `dataSchema`-validated at runtime).
  - failure `{ status: false, statusCode, message, error: { code, details } }` → throws `ApiError`.
- `ApiError.code`: registered `ErrorCode` (contracts) or one client-local code:
  - `NETWORK_ERROR` — fetch rejected (server down / offline). `statusCode: null`.
  - `INVALID_RESPONSE` — non-JSON body, non-envelope body, envelope with unregistered code, or schema-validated payload mismatch. Always carries the HTTP `statusCode`.
- Envelope `statusCode` ≠ HTTP status is recorded into `details` (`envelopeStatusCode` / `httpStatus`) — contract bug surfacing, never a crash.

## Authenticated sessions

- The access token lives in **sessionStorage only** (`sda:auth:session`) — it dies with the browser tab; there is no refresh token or `/me` endpoint in the contracts. Expired sessions are dropped on read (`lib/session/auth.ts`).
- `apiFetch(..., { auth: true })` attaches `Authorization: Bearer <token>` from the session store (header only — never in URLs or logs).
- React reads the session through `useSession()` (`hooks/use-session.ts`, `useSyncExternalStore`); `useHydrated()` exists because the hydration commit reports the server snapshot (null) and route guards must not redirect authenticated users before hydration settles.
- Login/register store `AuthResponse` via `saveSession` and ride to `?next=` (default `/library`); sign-out is `clearSession` plus the auth-changed event.
- Guarded routes render a skeleton during hydration and ride unauthenticated visitors to `/login?next=…`.
- `AUTH_REQUIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_EMAIL_TAKEN`, plan codes (`PLAN_LIMIT_EXCEEDED`, `PLAN_UPGRADE_REQUIRED`), and `PROVIDER_CONFIG_NOT_FOUND` all map to user copy in `USER_MESSAGES`.

## Rules

- **Secrets**: `providerKey` → `x-provider-api-key`, `projectKey` → `x-project-key`. Header-only; never in URLs, never logged. The client deliberately has no console logging.
- `message` = raw server message; `userMessage` = actionable copy from `USER_MESSAGES` (one entry per registered code — test enforces full coverage).
- No retries here. TanStack Query owns retry policy (`Providers`: queries `retry: false` by default — real progress only; per-query opt-in for polling).

## Query keys

`lib/query-keys.ts` — `health`, `providers`, `project(id)`, `requirements(projectId)`, `architecture(projectId)`, `run(runId)`. Build all cache keys through it.

## Tests

`lib/api/client.test.ts` — success unwrap, schema mismatch, registered error mapping, statusCode mismatch surfacing, network failure, non-JSON body, unregistered code, header forwarding, authenticated-session Bearer attach, full message-map coverage.
