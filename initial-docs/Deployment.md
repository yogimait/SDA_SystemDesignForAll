# Deployment — Vercel + Render + Supabase

Target topology:

```text
Browser
  ├── app.example.com  → Vercel (Next.js frontend_client)
  └── api.example.com  → Render (NestJS backend-server)
                         └── Supabase Postgres
```

Use **one registrable domain** for both hosts (`app.example.com` and
`api.example.com`). The refresh cookie is `SameSite=Strict`; `*.vercel.app` +
`*.onrender.com` are different sites and will break auth refresh in a new tab
after the 15-minute access token expires.

## 1. Supabase

1. Create a Supabase project in the region closest to Render.
2. Open **Project Settings → Database → Connection string**.
3. Choose **Session pooler** (port `5432`), not the transaction pooler first.
4. Use the full URL with `?sslmode=require`:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://postgres.[project-ref]:[url-encoded-password]@[region].pooler.supabase.com:5432/postgres?sslmode=require
```

- URL-encode special characters in the password.
- The backend runs Drizzle migrations automatically at boot.
- Do not expose the Supabase service-role key to the frontend; the backend owns
  auth and connects directly.
- The Free plan has 500 MB storage, 5 GB egress, and pauses after 7 days of low
  activity. Use Pro for a public deployment and backups.

## 2. Render backend

The repository root contains [`render.yaml`](../render.yaml). Create a
**Blueprint** in Render and point it at this repository.

The blueprint sets the non-secret production defaults:

```env
NODE_ENV=production
DATABASE_DRIVER=postgres
MOCK_PROVIDER=0
DEFAULT_PROVIDER=openrouter
DEFAULT_MODEL=z-ai/glm-5.3-flash
TRUST_PROXY=1
REQUIRE_EMAIL_VERIFICATION=0
CREDENTIALS_ENCRYPTION_KEY_VERSION=1
GENERATION_CONCURRENCY=1
```

Set these `sync: false` values in the Render dashboard:

```env
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres?sslmode=require
CORS_ORIGIN=https://app.example.com
APP_BASE_URL=https://app.example.com
CREDENTIALS_ENCRYPTION_KEY=<32-byte base64>
CSRF_SECRET=<random secret>
```

Generate the secrets locally, never commit them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

- Add the custom domain `api.example.com`.
- Health check path: `/api/health`.
- Keep the service at **one instance**. The generation worker and SSE stream are
  process-local.
- `plan: free` is demo-only: Render sleeps idle free services and can interrupt
  a generation run. Change to `starter` before inviting real users.
- `OPENROUTER_API_KEY` / `GROQ_API_KEY` are not needed in production. Users
  either save an encrypted account key or send `x-provider-api-key`. The env
  fallback is disabled when `NODE_ENV=production`.

## 3. Vercel frontend

Import this repository into Vercel.

Settings:

- **Root Directory:** `frontend_client`
- **Framework Preset:** Next.js
- Enable **Include source files outside of the Root Directory in the Build Step**
  so the shared `packages/contracts` workspace is available.
- `frontend_client/vercel.json` runs install/build from the monorepo root.

Environment variable for Production:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

`NEXT_PUBLIC_API_URL` is baked in at build time. Changing it requires a new
deployment, not just a restart.

Then add the custom domain `app.example.com`.

## 4. DNS

Use the exact targets shown by each dashboard:

```text
app.example.com  CNAME  cname.vercel-dns.com
api.example.com  CNAME  <render-service>.onrender.com
```

Wait for TLS certificates to become active before testing auth.

## 5. First-deploy checklist

1. `GET https://api.example.com/api/health` returns the envelope and `database: "postgres"`.
2. Register → login → refresh the page (refresh cookie works).
3. Create project → generate requirements → confirm → generate architecture.
4. Save a provider key to the account, reload, generate without re-entering it.
5. Watch the SSE stage stream through Render (no proxy buffering).
6. Delete the account and confirm the vault rows disappear.
7. Restart the Render service and confirm data persists.
8. Confirm `MOCK_PROVIDER=false` and `DATABASE_DRIVER=postgres` in Render logs.

## 6. Beta limitations to keep visible

- Password reset and verification emails are still dev-outbox only. Keep
  `REQUIRE_EMAIL_VERIFICATION=0`; do not promise password reset.
- Stripe is not configured. The stub completion route is hidden in production;
  do not advertise paid plans.
- Supabase Free can pause; Render Free can sleep.
- Groq free-tier keys cannot fit the full combined LLD/DSA generation.
- Losing `CREDENTIALS_ENCRYPTION_KEY` makes every stored provider credential
  unreadable. Back it up in a secret manager.

## 7. What not to do

- Do not set `DATABASE_DRIVER=pglite` on Render.
- Do not deploy the backend to Vercel serverless: the worker, SSE stream, and
  in-process run state need a long-running process.
- Do not expose the Supabase service-role key or database password to Vercel.
- Do not use `*.vercel.app` + `*.onrender.com` together for authenticated use
  without changing cookie policy. Use custom domains.

Related: [[Home]] · [[Architecture]] · [[Auth]] · [[Providers]]
