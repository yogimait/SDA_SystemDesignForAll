# Billing & Plans

Client surfaces for the backend billing slice (see `backend-server/docs/Billing.md`). Plans and limits come from `@sda/contracts` (`PLAN_CATALOG`) via `GET /api/billing/plans` — nothing is hardcoded in the UI.

## Pages

| Route | Data | Notes |
| --- | --- | --- |
| `/pricing` | `GET /api/billing/plans` | Free vs Pro cards from the API, current plan highlighted for signed-in users, limits + features rendered from the catalogue. Signed out → sign-in link back to `/pricing`. |
| `/billing/checkout/[id]` | `POST /api/billing/checkout/:id/complete` | Local **stub** checkout only (the dev provider has no hosted page). Sandbox copy, no card data, then `/billing/success`. |
| `/billing/success` | `GET /api/auth/me` | Re-reads the user and invalidates all queries so plan tier/limits update without a reload. Shows `You are on Pro` once the server confirms; otherwise a "webhook pending" note. |
| `/billing/cancel` | — | Provider-canceled checkout: nothing charged, plan unchanged, links back to plans/settings. |

## Checkout flow

`POST /api/billing/checkout {plan:"pro"}` → `{checkoutId, url, provider}`. `lib/billing/checkout.ts` resolves the target purely: same-origin URLs (the stub) navigate in-app; Stripe-hosted URLs get a full external redirect. Only `http:`/`https:` targets are navigable — `javascript:`, `data:` and malformed values resolve to `kind: "invalid"` and both callers (pricing checkout, settings portal) refuse the redirect instead of assigning it. The stub then completes through the non-production `POST /api/billing/checkout/:id/complete`.

## Settings → Billing

`GET /api/billing/subscription` drives the card: plan tier, subscription status, period end / cancel-at-period-end. Stripe deployments show **Manage billing** (`POST /api/billing/portal`, hosted portal) and **Cancel plan** (`POST /api/billing/cancel`, behind a focused confirm dialog that restates the consequence — stub downgrades immediately, Stripe keeps Pro until period end). The stub provider hides the portal control (its `/account/billing` URL is not part of this app) — no dead controls. Free accounts link to `/pricing`.

Dashboard plan-gate cards (`PLAN_LIMIT_EXCEEDED` / `PLAN_UPGRADE_REQUIRED`) link to `/pricing`.

## Tests

- Unit: `lib/billing/checkout.test.ts` (internal vs external target, completion path).
- Playwright `e2e/auth-billing.spec.ts`: pricing → stub checkout → success (plan refresh), settings cancel flows, dashboard plan-gate link.
