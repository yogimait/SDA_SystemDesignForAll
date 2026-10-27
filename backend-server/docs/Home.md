# Backend Documentation

Living documentation for `backend-server/` and the backend side of `packages/contracts/`. The backend is a NestJS 12 API that turns an idea into a confirmed requirements specification, then into a validated canonical LLD + HLD + DSA architecture model.

## Start here

| Note | What it explains |
| --- | --- |
| [[Architecture]] | Modules, request lifecycle, access control, envelope, configuration. |
| [[API]] | Endpoints, headers, status codes, error codes, examples. |
| [[Data-Model]] | Tables, relationships, JSONB payloads, migrations, Drizzle usage. |
| [[Generation]] | Run queue, stages, repair loops, two-phase generation, scoped regeneration. |
| [[Providers]] | BYOK, OpenRouter adapter, structured-output fallback, mock provider. |
| [[Testing]] | Unit, integration, e2e tests and local verification commands. |

## Current state

- Phases B0-B5 of the [backend roadmap](../../initial-docs/Roadmap-Planner-Backend.md) are implemented for the MVP, plus user accounts/Bearer auth, project ownership, saved provider config/preferences, plans, and dashboard analytics.
- Build, lint, unit tests, and e2e tests pass locally.
- Local persistence uses PGlite; production uses Postgres through the same repositories and migrations.
- The frontend consumes the same contracts from `@sda/contracts`.

## Quick start

From the repository root:

```bash
npm install
npm run dev:backend
```

The API listens on `http://localhost:3001/api` by default. With no provider key, start in deterministic mock mode:

```powershell
$env:MOCK_PROVIDER = "1"
npm run dev:backend
```

For real generation, send the OpenRouter key on each run-start request as `x-provider-api-key`. See [[Providers]].

## Commands

| Command (in `backend-server/`) | Purpose |
| --- | --- |
| `npm run build` | Build `@sda/contracts`, then compile Nest to `dist/`. |
| `npm run start:dev` | Watch-mode development server. |
| `npm run start:prod` | Run the compiled server (`node dist/main`). |
| `npm run lint` | Build contracts, then oxlint type-aware over `src/` and `test/`. |
| `npm run test` | Build contracts, then Vitest unit/integration suite. |
| `npm run test:e2e` | Build contracts, then Vitest + supertest e2e suite. |
| `npm run db:generate` | Generate a Drizzle SQL migration after schema changes. |

Migrations are applied automatically at boot by `DatabaseService`; there is no separate migrate command.

Related: [[Architecture]] · [[API]] · [[Data-Model]] · [[Generation]] · [[Providers]] · [[Testing]]
