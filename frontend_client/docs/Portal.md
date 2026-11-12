# Portal — user account surfaces

Post-[[Workspace-LLD]] round: accounts, project library, billing, and the analytics dashboard. Generation uses the hosted server model, so there are no provider preferences or key controls. All payloads render from `@sda/contracts`; see [[API-Client]] for the session/Bearer mechanics.

## Sessions and route access

- `/login` — sign in + create account in one card. On success `saveSession` stores `AuthResponse` and the user rides to `?next=` (default `/library`). `?next=` is validated by `safeNextPath` (`lib/auth/safe-next.ts`): only a rooted same-origin relative path is resumed — protocol-relative (`//host`), absolute (`https:`, `javascript:`) and backslash/control-character values fall back to `/library`. Error codes land in `USER_MESSAGES` copy inside a `role="alert"` block.
- Guarded pages (`/library`, `/dashboard`, `/settings`) use the same pattern: skeleton during hydration, then redirect to `/login?next=…` when the session is absent. The redirect is **held until `useHydrated()`** — during hydration `useSyncExternalStore` reports the server snapshot (null session), and acting on that once signed every user out on first paint (bug found and fixed by the e2e round; do not regress).
- **Owner access without the creator's key (D2)**: every project/run fetch (requirements flow, workspace, run polling, confirm, regenerate) sends the Bearer session alongside `x-project-key` (`auth: loadSession() !== null`). Reopening a library project in a fresh tab authorizes as the owner when the backend accepts Bearer-only access; the access-key error remains for anonymous legacy projects.
- **Settings never hides an expired session (D4)**: a session the API rejects as unauthenticated is no longer shown as a signed-in page — the client drops it and redirects to `/login?next=…` (see [[API-Client]]). `AUTH_REQUIRED` on the provider-config/preferences GET therefore cannot render a stale identity; the card's "Sign in" prompt only shows if a redirect is impossible (no `window`).
- **Sign-out (D3)**: header buttons call `signOut()` (`hooks/use-session.ts`) — `POST /api/auth/logout` first (best effort) so the server session row revokes, then the local clear.
- Sign out: portal header button → `clearSession` → `/login`.

## Pages

| Route | Data | Notes |
| --- | --- | --- |
| `/library` | `GET /api/projects?status&limit&cursor` | Status filter (4 statuses + all, horizontal scroll row on phones with 44px hit targets), cursor pagination (Load more), workspace link per project. |
| `/dashboard` | `GET /api/dashboard?range` | Range switch (7/30/90), usage totals, token buckets, top models, recent runs (`sortRunsNewestFirst`), empty state, plan-gate card for `PLAN_*` codes. Formatting: `lib/dashboard/format.ts`. Range switches keep the previous content with a subtle `aria-busy` + "Updating…" status — skeletons only on first load (QA D3). Chart ticks are edge-anchored and evenly spread (`bucketTickIndices`) so they never clip (QA D4). |
| `/settings` | `GET /api/billing/subscription` + `DELETE /api/users/me` | Billing (plan, renewal, cancel, provider portal), Account (verification status + resend, password-confirmed delete), and a hosted-generation explainer. No provider/model/key controls. See [[Billing]] and [[Auth-Flows]]. |

## Settings: account and billing only

Settings shows the current subscription, account verification, and account
deletion. Generation is included with the plan; the server selects and runs the
hosted model, so the page has no provider, model, or API-key controls. The old
provider dialog, saved-keys card, and provider-preference plumbing were removed
with the hosted-key switch.

## Theme preference plumbing (D7)

`lib/theme/preferences.ts` + `components/theme/theme-applier.tsx` (mounted once inside `app/providers.tsx`): the localStorage value lands on `<html data-theme>` after hydration. The visual palette stays the single dark "coffee" brand (recorded user decision 2026-10-23, `globals.css`), and no UI writes the preference today — a palette switch ships together with a light token set.

## Sign-in-and-continue (idea hand-off)

When the backend returns `AUTH_REQUIRED` for anonymous `POST /api/projects`, the landing form does not lose the typed idea: it stashes it in sessionStorage (`sda:pending-idea`, `lib/session/keys.ts`) and rides to `/login?next=/`, where a notice explains why sign-in is needed. After the redirect back to the landing page, the form consumes the slot (once) and pre-fills the textarea. Helpers: `save/peek/consumePendingIdea` (peek is non-destructive; consume clears). E2E covers both the stash-and-ride and the full hand-off round-trip.

## Backend coupling (as of this round)

The backend implements the user slice live (verified): `POST /api/auth/register`, project list with owner scoping, billing subscription/checkout/portal/cancel, account deletion, and `GET /api/dashboard?range=...`. The analytics route mounts at **`/api/dashboard`, not `/api/users/me/dashboard`**; the auth "me" route is `/api/auth/me` (used by the billing success page and boot refresh). The deterministic journeys intercept these endpoints with contract-shaped envelopes for CI independence.

## Base UI gotchas (learned here)

- Base UI `Select` trigger is a combobox **button** — assert with `toHaveText`, not `toHaveValue`.
- Base UI `Tabs` unmounts inactive panels (no forceMount) — tab locators are role-safe.
- Next's route announcer (`__next-route-announcer__`) also has `role="alert"` — scope alert assertions to their form/section.
