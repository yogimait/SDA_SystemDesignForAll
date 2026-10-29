# Portal — user account surfaces

Post-[[Workspace-LLD]] round: accounts, project library, provider preferences, and the analytics dashboard. All payloads render from `@sda/contracts`; see [[API-Client]] for the session/Bearer mechanics.

## Sessions and route access

- `/login` — sign in + create account in one card. On success `saveSession` stores `AuthResponse` and the user rides to `?next=` (default `/library`). Error codes land in `USER_MESSAGES` copy inside a `role="alert"` block.
- Guarded pages (`/library`, `/dashboard`, `/settings`) use the same pattern: skeleton during hydration, then redirect to `/login?next=…` when the session is absent. The redirect is **held until `useHydrated()`** — during hydration `useSyncExternalStore` reports the server snapshot (null session), and acting on that once signed every user out on first paint (bug found and fixed by the e2e round; do not regress).
- **Owner access without the creator's key (D2)**: every project/run fetch (requirements flow, workspace, run polling, confirm, regenerate) sends the Bearer session alongside `x-project-key` (`auth: loadSession() !== null`). Reopening a library project in a fresh tab authorizes as the owner when the backend accepts Bearer-only access; the access-key error remains for anonymous legacy projects.
- **Settings never hides an expired session (D4)**: a session the API rejects as unauthenticated is no longer shown as a signed-in page — the client drops it and redirects to `/login?next=…` (see [[API-Client]]). `AUTH_REQUIRED` on the provider-config/preferences GET therefore cannot render a stale identity; the card's "Sign in" prompt only shows if a redirect is impossible (no `window`).
- **Sign-out (D3)**: header buttons call `signOut()` (`hooks/use-session.ts`) — `POST /api/auth/logout` first (best effort) so the server session row revokes, then the local clear.
- Sign out: portal header button → `clearSession` → `/login`.

## Pages

| Route | Data | Notes |
| --- | --- | --- |
| `/library` | `GET /api/projects?status&limit&cursor` | Status filter (4 statuses + all, horizontal scroll row on phones with 44px hit targets), cursor pagination (Load more), workspace link per project, **provider setup trigger kept visibly labeled at every width** (`labeled-provider` rule in globals.css; BYOK lives on the landing + library pages only). |
| `/dashboard` | `GET /api/dashboard?range` | Range switch (7/30/90), usage totals, token buckets, top models, recent runs (`sortRunsNewestFirst`), empty state, plan-gate card for `PLAN_*` codes. Formatting: `lib/dashboard/format.ts`. Range switches keep the previous content with a subtle `aria-busy` + "Updating…" status — skeletons only on first load (QA D3). Chart ticks are edge-anchored and evenly spread (`bucketTickIndices`) so they never clip (QA D4). |
| `/settings` | `GET/PUT /api/users/me/provider-config` | Saved generation defaults (**provider + model, no API key**). The provider and model are dropdowns fed by `GET /api/providers` (provider names, not raw ids; model disabled until a provider is picked). This is the **single source**: the provider dialog pre-fills from it and writes it back on save, so a run uses the choice shown here once its key is in the tab. |

## Settings: one source of truth

- `provider-config` (`GET/PUT /api/users/me/provider-config`) owns provider + model. The provider dialog (landing/library/requirements) pre-fills from it and `PUT`s it back on save, so there is no second copy. A run request carries provider + model + `x-provider-api-key`; the backend falls back to `DEFAULT_PROVIDER`/`DEFAULT_MODEL` only when the request omits them.
- The former **Preferences** card is gone. Its theme switch changed nothing (the app ships one branded dark palette) and its `defaultProvider`/`defaultModel` duplicated `provider-config` with no read path in run orchestration — removed rather than left to diverge. `data-theme` plumbing (`lib/theme/preferences.ts`, `components/theme/theme-applier.tsx`) stays for a future palette; there is no control to set it.
- **Reasoning effort** is no longer editable: the stored `reasoningEffort` is not read by any generator (adapters take it from `OPENROUTER_REASONING_EFFORT`/`GROQ_REASONING_EFFORT`). Settings keeps the stored value intact on save but does not pretend to change it.

## Theme preference plumbing (D7)

`lib/theme/preferences.ts` + `components/theme/theme-applier.tsx` (mounted once inside `app/providers.tsx`): the localStorage value lands on `<html data-theme>` after hydration. The visual palette stays the single dark "coffee" brand (recorded user decision 2026-10-23, `globals.css`), and no UI writes the preference today — a palette switch ships together with a light token set.

## Sign-in-and-continue (idea hand-off)

When the backend returns `AUTH_REQUIRED` for anonymous `POST /api/projects`, the landing form does not lose the typed idea: it stashes it in sessionStorage (`sda:pending-idea`, `lib/session/keys.ts`) and rides to `/login?next=/`, where a notice explains why sign-in is needed. After the redirect back to the landing page, the form consumes the slot (once) and pre-fills the textarea. Helpers: `save/peek/consumePendingIdea` (peek is non-destructive; consume clears). E2E covers both the stash-and-ride and the full hand-off round-trip.

## Backend coupling (as of this round)

The backend implements the user slice live (verified): `POST /api/auth/register`, project list with owner scoping, `GET/PUT /api/users/me/provider-config` (`PROVIDER_CONFIG_NOT_FOUND` when unset) and `/api/users/me/preferences`, and `GET /api/dashboard?range=…` — note the analytics route mounts at **`/api/dashboard`, not `/api/users/me/dashboard`**; the auth "me" route is `/api/auth/me` (unused frontend-side; session restores from sessionStorage). The deterministic journeys still intercept these endpoints with contract-shaped envelopes for CI independence; a one-off live (unintercepted) journey — register → library → real config/preferences save → real dashboard → sign out — was verified passing against `MOCK_PROVIDER=1` on :3001.

## Base UI gotchas (learned here)

- Base UI `Select` trigger is a combobox **button** — assert with `toHaveText`, not `toHaveValue`.
- Base UI `Tabs` unmounts inactive panels (no forceMount) — tab locators are role-safe.
- Next's route announcer (`__next-route-announcer__`) also has `role="alert"` — scope alert assertions to their form/section.
