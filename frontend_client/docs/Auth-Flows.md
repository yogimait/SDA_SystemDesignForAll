# Auth flows (hardened)

Standalone auth pages plus the shared session semantics behind them. Backend contract: `backend-server/docs/Auth.md`; client transport rules: [[API-Client]].

## Pages

| Route | Behavior |
| --- | --- |
| `/login` | Sign in / create account tabs (session stored via `saveSession`: access token memory-only, identity persisted). "Forgot password?" links to `/forgot-password`. Password fields have a show/hide control; the register tab shows the four live password rules. The back link is styled as an outline button. |
| `/forgot-password` | `POST /api/auth/forgot-password {email}`; **always** the neutral "if that email has an account…" copy (no account enumeration), even on repeated submissions. |
| `/reset-password?token=…` | `POST /api/auth/reset-password {token,password}` from the emailed link. Client validates the four password rules + confirmation, with show/hide controls; success clears the local session (the server revoked every session) and points at sign-in. `details.reason = "reset_invalid"` gets reset-specific copy ("This reset link is invalid or has expired") plus a **Request a new reset link** action to `/forgot-password` — never the generic credential error. |
| `/verify-email?token=…` | `POST /api/auth/verify-email {token}` on load (deduped so dev StrictMode cannot consume the single-use token twice). Success refreshes the identity when signed in. `details.reason = "verification_invalid"` gets link-specific copy plus the resend (signed in) / sign-in action; a missing token explains the incomplete link. |

## Password rules

New passwords (register/reset) require exactly four visible rules:

1. At least 8 characters.
2. One uppercase letter.
3. One number.
4. One special character.

`@sda/contracts` owns the rules; `lib/auth/password.ts` maps them to live
checklist state. Login and account deletion accept existing passwords so
accounts created before the policy can still sign in.

## Verification banner

`components/portal/verify-email-banner.tsx` renders for signed-in accounts with `emailVerifiedAt === null` on the library, dashboard, settings, and requirements pages. It is non-blocking and offers **Resend email** (`POST /api/auth/resend-verification`). When the server gates generation (`401 AUTH_REQUIRED`, `details.reason = "email_not_verified"`), the requirements flow and spec editor surface the same action instead of a generic sign-in prompt.

## Account deletion

Settings → Account shows the verification status and a destructive **Delete account** flow: a focused dialog requires the current password (`lib/account/delete-guard.ts` keeps the confirm button disabled until it could be valid), then `DELETE /api/users/me {password}`. Success clears the local identity and navigates to `/login`.

## Identity consistency

The header, guards, and pages all read the same `useSession()` store. A refresh failure clears the identity before redirecting, so no surface can show a signed-in header while the API says 401 (see [[API-Client]] for the refresh-once/retry-once rule and the verification-gate exception).

## Mobile affordances

Destructive/checkout controls (stub **Complete upgrade**, delete-account dialog, cancel-plan dialog) use `min-h-[44px]` on phones and `sm:min-h-9` on larger screens, so the tap target meets 44px regardless of the root font scaling. `e2e/auth-billing.spec.ts` asserts the rendered heights at 390px.

## Tests

- Unit: `lib/auth/password.test.ts` (four rules), `lib/api/client.test.ts` (refresh-once/retry, sign-out on refresh failure, cookie-only new-tab refresh, stale-cookie no-bounce, CSRF header), `lib/session/auth.test.ts` (memory token, migration, pending state, boot-settled flag), `lib/account/delete-guard.test.ts`.
- Playwright `e2e/auth-billing.spec.ts`: forgot/reset/verify flows, verification banner resend, delete account, boot refresh with an expired in-memory token, plus the billing journeys in [[Billing]]. `e2e/auth-billing-ux.spec.ts` covers the password reveal control and the button-styled back link.
