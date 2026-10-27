# Portal — user account surfaces

Post-[[Workspace-LLD]] round: accounts, project library, provider preferences, and the analytics dashboard. All payloads render from `@sda/contracts`; see [[API-Client]] for the session/Bearer mechanics.

## Sessions and route access

- `/login` — sign in + create account in one card. On success `saveSession` stores `AuthResponse` and the user rides to `?next=` (default `/library`). Error codes land in `USER_MESSAGES` copy inside a `role="alert"` block.
- Guarded pages (`/library`, `/dashboard`, `/settings`) use the same pattern: skeleton during hydration, then redirect to `/login?next=…` when the session is absent. The redirect is **held until `useHydrated()`** — during hydration `useSyncExternalStore` reports the server snapshot (null session), and acting on that once signed every user out on first paint (bug found and fixed by the e2e round; do not regress).
- Sign out: portal header button → `clearSession` → `/login`.

## Pages

| Route | Data | Notes |
| --- | --- | --- |
| `/library` | `GET /api/projects?status&limit&cursor` | Status filter (4 statuses + all), cursor pagination (Load more), workspace link per project. |
| `/dashboard` | `GET /api/dashboard?range` | Range switch (7/30/90), usage totals, token buckets, top models, recent runs (`sortRunsNewestFirst`), empty state, plan-gate card for `PLAN_*` codes. Formatting: `lib/dashboard/format.ts`. |
| `/settings` | `GET/PUT /api/users/me/provider-config` + `GET/PUT /api/users/me/preferences` | Saved provider/model defaults (**no API key stored**) + theme/default provider/model preferences. BYOK stays request-scoped in the existing provider dialog. |

## Sign-in-and-continue (idea hand-off)

When the backend returns `AUTH_REQUIRED` for anonymous `POST /api/projects`, the landing form does not lose the typed idea: it stashes it in sessionStorage (`sda:pending-idea`, `lib/session/keys.ts`) and rides to `/login?next=/`, where a notice explains why sign-in is needed. After the redirect back to the landing page, the form consumes the slot (once) and pre-fills the textarea. Helpers: `save/peek/consumePendingIdea` (peek is non-destructive; consume clears). E2E covers both the stash-and-ride and the full hand-off round-trip.

## Backend coupling (as of this round)

The backend implements the user slice live (verified): `POST /api/auth/register`, project list with owner scoping, `GET/PUT /api/users/me/provider-config` (`PROVIDER_CONFIG_NOT_FOUND` when unset) and `/api/users/me/preferences`, and `GET /api/dashboard?range=…` — note the analytics route mounts at **`/api/dashboard`, not `/api/users/me/dashboard`**; the auth "me" route is `/api/auth/me` (unused frontend-side; session restores from sessionStorage). The deterministic journeys still intercept these endpoints with contract-shaped envelopes for CI independence; a one-off live (unintercepted) journey — register → library → real config/preferences save → real dashboard → sign out — was verified passing against `MOCK_PROVIDER=1` on :3001.

## Base UI gotchas (learned here)

- Base UI `Select` trigger is a combobox **button** — assert with `toHaveText`, not `toHaveValue`.
- Base UI `Tabs` unmounts inactive panels (no forceMount) — tab locators are role-safe.
- Next's route announcer (`__next-route-announcer__`) also has `role="alert"` — scope alert assertions to their form/section.
