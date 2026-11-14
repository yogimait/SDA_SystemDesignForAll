# Abuse Protection

Public launch controls for account creation, generation spend, and the single
worker queue. These are application-level guardrails; they reduce abuse but do
not replace an edge WAF, provider spend alerts, or email-provider monitoring.

## Controls

| Control | Default | Where |
| --- | --- | --- |
| Email verification before project creation and generation | Required in production | `REQUIRE_EMAIL_VERIFICATION=1`; [[Auth]] |
| Per-IP signup budget | 3 per hour | `SIGNUP_THROTTLE_LIMIT`, `SIGNUP_THROTTLE_TTL_MS` |
| Per-owner run-start budget | 10 per hour | `GENERATION_THROTTLE_LIMIT`, `GENERATION_THROTTLE_TTL_MS` |
| Global queued + running cap | 10 | `GENERATION_MAX_QUEUED` |
| Global generation kill switch | enabled | `GENERATION_ENABLED` |
| Global daily token budget | 2,000,000 | `GLOBAL_DAILY_TOKEN_LIMIT` |
| Global daily run budget | 100 | `GLOBAL_DAILY_RUN_LIMIT` |
| New-signup kill switch | enabled | `SIGNUP_ENABLED` |
| Free plan allowance | 3 projects, 50 runs / 30 days, 500k tokens / 30 days | `PLAN_CATALOG`, [[Billing]] |
| Pro plan allowance | 100 projects, 1,000 runs / 30 days, 10M tokens / 30 days | `PLAN_CATALOG`, [[Billing]] |
| Auth login/reset budget | 5 per minute | `AUTH_THROTTLE_LIMIT`, `AUTH_THROTTLE_TTL_MS` |

Run starts are tracked by the authenticated owner when
`ProjectAccessGuard` has resolved a Bearer session; project-key-only legacy
requests fall back to the IP tracker. Throttle rejections return
`429 QUOTA_EXCEEDED` with `Retry-After`.

The queue cap is checked before a run is queued. A full queue returns
`429 QUOTA_EXCEEDED` with `details.reason = "generation_queue_full"`.

`GENERATION_ENABLED=0` immediately pauses all new runs with
`reason = "generation_disabled"`. `SIGNUP_ENABLED=0` pauses registration with
`reason = "signup_disabled"` while leaving existing accounts usable.
`GLOBAL_DAILY_TOKEN_LIMIT` and `GLOBAL_DAILY_RUN_LIMIT` are process-wide
budgets across every account and are checked before each run is queued.

Production always enforces email verification before project creation and
generation through `RequireVerifiedEmailGuard`, even if a stale deployment
still has `REQUIRE_EMAIL_VERIFICATION=0`. The flag remains for local/test
control; set it to `1` in production so intent and behavior agree.

## Ops analytics

`GET /api/admin/abuse?range=last_7_days|last_30_days|last_90_days` returns
system-wide totals, daily signups/projects/runs/tokens/failures, active runs,
and the top accounts by token usage. It is protected by `AuthGuard` and an
email allowlist:

```env
ADMIN_EMAILS=ops@example.com,founder@example.com
```

An empty `ADMIN_EMAILS` disables the route for everyone. Non-admin accounts get
`403 ADMIN_ACCESS_DENIED`. The page is available at `/admin/abuse` and is
intentionally not linked from public navigation.

The page contains account emails. Do not include it in public screenshots,
shared links, or analytics exports. Use it to spot:

- a signup spike after a launch post;
- a single account consuming a disproportionate share of tokens;
- a rising failure or interrupted-run count;
- a queue that stays non-empty for too long.

## Deployment checklist

1. `NODE_ENV=production`
2. `REQUIRE_EMAIL_VERIFICATION=1`
3. `EMAIL_PROVIDER=resend` with a verified sender
4. `TRUST_PROXY=1` only behind one trusted TLS proxy; otherwise per-IP limits
   see the proxy address, not the client
5. `ADMIN_EMAILS` set to the ops accounts
6. `THROTTLE_LIMIT` and `SIGNUP_THROTTLE_LIMIT` reviewed for expected launch
   traffic
7. `GENERATION_MAX_QUEUED` set below the worker capacity you can actually drain
8. Provider spend alerts and an edge rate limit/WAF configured outside the app

## Non-goals

- This does not prove a user is human; a CAPTCHA or device attestation is a
  separate decision.
- This does not stop distributed multi-account abuse with many IPs and email
  addresses. Edge reputation, email-domain controls, and manual review remain
  necessary.
- This does not replace provider-side budget alerts. The hosted key can still
  spend money if an application guard is bypassed.

Related: [[Home]] · [[Auth]] · [[API]] · [[Generation]] · [[Billing]]
