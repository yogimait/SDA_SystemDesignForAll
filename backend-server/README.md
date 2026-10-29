# Backend Server

NestJS 12 API for System Design All-in-One. It turns a software idea into a confirmed requirements specification, then into a validated canonical architecture model (HLD + LLD + DSA + learning steps). The frontend consumes the same Zod contracts from `@sda/contracts`.

## Requirements

- Node.js 22+
- npm (workspaces installed from the repository root)
- No Docker and no external database for local development

## Quick start

From the repository root:

```bash
npm install
npm run dev:backend
```

The API listens on `http://localhost:3001/api`. For deterministic local generation without a provider key:

```powershell
$env:MOCK_PROVIDER = "1"
npm run dev:backend
```

```bash
MOCK_PROVIDER=1 npm run dev:backend
```

## Environment

Configuration is Zod-validated at boot; invalid values stop the process with a readable error. `backend-server/.env` is loaded for local development when present; shell variables and process-manager variables win. `.env` is gitignored; `.env.example` is the template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins. |
| `DATABASE_DRIVER` | `pglite` | `pglite` or `postgres`. |
| `PGLITE_DATA_DIR` | `.data/pglite` | PGlite data directory; `memory://` for tests. |
| `DATABASE_URL` | — | Required when `DATABASE_DRIVER=postgres`. |
| `MOCK_PROVIDER` | `0` | Explicit deterministic provider for demos/tests. |
| `DEFAULT_PROVIDER` | `openrouter` | Provider when a request omits one: `openrouter` or `groq`. |
| `DEFAULT_MODEL` | `z-ai/glm-5.3-flash` | Active model when a request omits one. |
| `OPENROUTER_MODELS` | `z-ai/glm-5.3-flash,...` | Comma-separated OpenRouter model catalog shown by `GET /api/providers`. |
| `GROQ_MODELS` | `openai/gpt-oss-120b,...` | Comma-separated Groq model catalog shown by `GET /api/providers`. |

`OPENROUTER_MODEL` and `GROQ_MODEL` were renamed to the plural forms above. The old singular names are ignored; move existing values into the comma-separated catalogs. Keep `DEFAULT_MODEL` inside the selected provider's catalog so the dropdown shows the active default.
| `OPENROUTER_REASONING_EFFORT` | `low` | `off`, `low`, `medium`, `high`, or `max`; reasoning tokens share `max_tokens`. |
| `GROQ_REASONING_EFFORT` | `low` | `off`, `low`, `medium`, or `high`; sent as `reasoning_effort`. |
| `OPENROUTER_API_KEY` | — | Local development fallback only. The `x-provider-api-key` header wins; ignored when `NODE_ENV=production`. |
| `GROQ_API_KEY` | — | Local development fallback only. The `x-provider-api-key` header wins; ignored when `NODE_ENV=production`. |
| `GENERATION_CONCURRENCY` | `1` | Reserved; the worker is single-run. |
| `GENERATION_POLL_INTERVAL_MS` | `100` | Worker polling cadence. |
| `MAX_REQUEST_BYTES` | `1000000` | JSON body limit. |
| `THROTTLE_LIMIT` | `10` | Run-start requests per IP per window. |
| `THROTTLE_TTL_MS` | `3600000` | Throttle window. |

## Real provider runs

The production path is BYOK: send the OpenRouter key as `x-provider-api-key` when starting a run. It stays in memory for that run, is never persisted, and is redacted from logs. With `MOCK_PROVIDER=1`, no key is needed and the mock provider wins over any request value.

For local development, you can put `OPENROUTER_API_KEY` and/or `GROQ_API_KEY` in `backend-server/.env` instead of using the provider dialog on every run. The request header still wins; production ignores the env fallback. Never commit `.env` or set these variables in a deployed environment. Groq's free GPT-OSS 120B key is limited to 8k TPM, so it cannot run the full 64k LLD/DSA stage in one request; use OpenRouter, upgrade Groq, or split the stage.

```http
POST /api/projects
Content-Type: application/json

{ "idea": "A collaborative workspace for small teams." }
```

The response contains a one-time `accessKey`; send it as `x-project-key` on every project-scoped route. See [docs/API.md](docs/API.md) for the full surface.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + database driver. |
| `GET` | `/api/providers` | Provider metadata and defaults. |
| `POST` | `/api/auth/register` | Create account; returns Bearer session. |
| `POST` | `/api/auth/login` | Authenticate; returns Bearer session. |
| `GET` | `/api/auth/me` | Current user. |
| `POST` | `/api/auth/logout` | Revoke current session. |
| `POST` | `/api/projects` | Create project; owner when authenticated; access key once. |
| `GET` | `/api/projects` | List owned projects with cursor/limit/status. |
| `GET` | `/api/projects/:id` | Project state. |
| `GET`/`PUT` | `/api/provider-config` | Read/save non-secret provider selection. |
| `GET`/`PUT` | `/api/preferences` | Read/merge user preferences. |
| `GET` | `/api/dashboard` | Usage totals, buckets, top models, recent runs. |
| `POST` | `/api/projects/:id/requirements` | Start requirements generation. |
| `GET` / `PUT` | `/api/projects/:id/requirements` | Read / save and confirm the spec. |
| `POST` | `/api/projects/:id/architecture` | Start two-phase architecture generation. |
| `POST` | `/api/projects/:id/architecture/regenerate` | Regenerate `hld`, `lld`, or `dsa`. |
| `GET` | `/api/projects/:id/architecture` | Current version + validation report. |
| `GET` | `/api/runs/:runId` | Poll run status, stages, usage, errors. |
| `GET` | `/api/runs/:runId/events` | SSE replay/live run and stage events. |

SSE responses are `text/event-stream`, not JSON envelopes; polling remains available. A comment heartbeat is sent every 10 seconds and a terminal run frame closes the stream.

Every JSON response uses the shared envelope: `{ status, statusCode, data }` on success; `{ status, statusCode, message, error: { code, details? } }` on failure.

## Persistence

- Local/test: PGlite at `.data/pglite` (gitignored) or `memory://`.
- Production: Postgres via `DATABASE_URL`.
- One Drizzle schema and the same migrations for both.
- Migrations are applied automatically at boot. Generate a new one after schema changes:

```bash
npm run db:generate
```

Do not add Docker or a separate database service for local development.

## Generation model

- Requirements: `analyze_idea` → `persist`; one repair attempt.
- Architecture: `hld_model` → `lld_dsa_model` → `validate` → `persist`; two repair attempts per phase.
- Stage state is persisted. The API never simulates progress.
- One active run per project, enforced by a service check and a partial unique index.
- Scoped regeneration pins untouched sections and prunes stale learning references.
- A failed Phase B can reuse the validated HLD from the failed run with the same requirements hash.

See [docs/Generation.md](docs/Generation.md).

## Commands

Run from `backend-server/`:

```bash
npm run build        # contracts + Nest build
npm run start:dev    # watch mode
npm run start:prod   # node dist/main
npm run lint         # contracts + oxlint type-aware
npm run test         # contracts + unit/integration
npm run test:e2e     # contracts + HTTP e2e
npm run db:generate  # Drizzle migration from schema.ts
```

Always run build, lint, unit, and e2e before calling backend work done.

## Project structure

```text
src/
  architecture/     validator, controller, service
  common/           envelope, errors, access guard, validation, redaction
  config/           Zod env contract
  database/         schema, migrations bootstrap, repositories
  generation/       run service, worker, generators
  health/
  projects/
  providers/        interface, registry, OpenRouter, mock, prompts, JSON Schema
  requirements/
drizzle/            generated SQL migrations and metadata
test/               e2e and unit/integration suites
docs/               living backend documentation
```

## Documentation

Start at [docs/Home.md](docs/Home.md): architecture, API, data model, generation, providers, and testing. The project planning vault lives in `../initial-docs/`.

## Security notes

- Project access keys are random 256-bit values, stored only as SHA-256 hashes and compared in constant time.
- Passwords use scrypt with per-password salt; session tokens are opaque and stored only as SHA-256 hashes.
- Provider keys are never logged, persisted, or included in error details.
- Request bodies are capped; error messages are redacted and bounded.
- Login performs a dummy scrypt verification for unknown emails so response timing does not reveal account existence.
- API responses set `nosniff`, frame-deny, no-referrer, restrictive CSP/Permissions-Policy headers, and omit `X-Powered-By`.
- `MOCK_PROVIDER` is off unless explicitly set.
- Bearer sessions and project keys are the access boundaries; anonymous projects remain key-scoped.
