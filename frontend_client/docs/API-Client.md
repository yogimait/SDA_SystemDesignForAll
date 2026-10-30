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

## Authenticated sessions (auth hardening)

- **Access token = memory only** (15 min TTL). It is never written to localStorage or sessionStorage. Only the user snapshot (`sda:auth:user`, identity/plan/verification) is persisted, so a reload re-mints the token from the httpOnly `sda_refresh` cookie through `POST /api/auth/refresh` (`components/session/session-bootstrap.tsx` → `ensureAccessToken`). Legacy entries that embedded a token are migrated: the user is kept, the token is deleted.
- **`credentials: "include"` on every request**; state-changing requests send `x-csrf-token` read from the readable `sda_csrf` cookie (double-submit, same-site origin).
- **Refresh once, retry once**: `auth: true` calls ensure a live token first; a 401 `AUTH_REQUIRED` triggers a single refresh + one retry of the same request. A failed refresh (or a second 401) clears the identity and navigates to `/login?next=<path+query>` (full reload) — only when an identity existed, so a stale cookie on an anonymous visit never bounces. **A new tab with no identity snapshot still refreshes**: the readable `sda_csrf` cookie (issued with the httpOnly refresh cookie) is the hint, and a successful refresh restores the user snapshot. Route guards wait for the boot refresh (`useAuthBootSettled`) before redirecting, so cookie-only tabs are restored instead of sent to login. `/api/auth/*` endpoints never start a refresh loop, and `AUTH_REQUIRED` with `details.reason = "email_not_verified"` is a verification gate, not a dead token. A refresh that resolves after a sign-out is discarded (session epoch), so a concurrent 401 cannot resurrect the session.
- `loadSession()` returns the in-memory session, or a **pending** session (identity, empty token) while a refresh is in flight; `sessionStatus()` distinguishes authenticated / pending / anonymous. Guards use the shared `useSession()` store, so the header and the page always agree.
- Login/register store `AuthResponse` via `saveSession` (memory + identity) and ride to `?next=` (default `/library`); sign-out posts `/api/auth/logout` (cookies + CSRF) then clears the store.
- `AUTH_REQUIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_EMAIL_TAKEN`, plan codes, and `PROVIDER_CONFIG_NOT_FOUND` map to user copy in `USER_MESSAGES`; `requiresEmailVerification(error)` surfaces the verification action.

## Rules

- **Secrets**: `providerKey` → `x-provider-api-key`, `projectKey` → `x-project-key`, CSRF → `x-csrf-token`. Header-only; never in URLs, never logged. A `null`/empty `projectKey` skips the header (owner-Bearer-only flows); the client deliberately has no console logging. Cookies travel automatically (`credentials: "include"`).
- `message` = raw server message; `userMessage` = actionable copy from `USER_MESSAGES` (one entry per registered code — test enforces full coverage). `QUOTA_EXCEEDED` stays generation-worded in the table; auth pages map that one code to neutral copy ("Too many requests. Wait a moment and try again.") through `authRateLimitCopy` (`lib/auth/messages.ts`), so a sign-in throttle never mentions generation.
- No retries here. TanStack Query owns retry policy (`Providers`: queries `retry: false` by default — real progress only; per-query opt-in for polling).

## Query keys

`lib/query-keys.ts` — `health`, `providers`, `project(id)`, `requirements(projectId)`, `architecture(projectId)`, `run(runId)`. Build all cache keys through it.

## Tests

`lib/api/client.test.ts` — success unwrap, schema mismatch, registered error mapping, statusCode mismatch surfacing, network failure, non-JSON body, unregistered code, header forwarding, credential-mode cookies, Bearer attach, refresh-once-then-retry, refresh failure sign-out, proactive refresh for an expired in-memory token, cookie-only new-tab refresh (identity restored), stale-cookie no-bounce, verification-gate passthrough, CSRF header on mutations, full message-map coverage.
`lib/session/auth.test.ts` — memory-token store, identity-only persistence, legacy entry migration, pending/expired semantics, plan/verification refresh, clear + event, CSRF cookie read.
`lib/billing/checkout.test.ts` — internal stub vs external Stripe checkout targets, completion path.
`lib/account/delete-guard.test.ts` — delete-account password confirmation guard.
