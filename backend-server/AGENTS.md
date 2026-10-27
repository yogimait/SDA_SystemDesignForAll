# Backend Rules — System Design All-in-One

Extends the repository and global rules. Read `../AGENTS.md`, the backend docs in `docs/` (start at `docs/Home.md`), and the backend planner in `../initial-docs/Roadmap-Planner-Backend.md` before changing behavior.

## Scope

`backend-server/` is a NestJS 12 ESM API. Shared DTOs and the canonical `ArchitectureModel` live in `../packages/contracts/`. Never edit `frontend_client/` from backend work; another agent may own it.

## Commands

Run from `backend-server/`:

```bash
npm run build        # builds @sda/contracts, then Nest
npm run lint         # builds contracts, then oxlint --type-aware
npm run test         # builds contracts, then Vitest unit/integration
npm run test:e2e     # builds contracts, then Vitest + supertest
npm run db:generate  # Drizzle SQL migration after schema edits
```

All four checks must pass before backend work is done. Tests use in-memory PGlite and the mock provider; do not call real APIs in tests.

## Invariants

- **Envelope**: every JSON response goes through the global interceptor/filter. Helpers in `@sda/contracts` are the only construction points; `statusCode` must match the HTTP status.
- **Error codes**: register new codes in `packages/contracts/src/envelope.ts` and map them in `src/common/errors/app-error.ts`. Never inline a new code string.
- **Contracts**: include request/response schemas in `@sda/contracts`. Do not redefine DTOs or the architecture model in this app.
- **Canonical model only**: persist and return the validated model. No sample architectures, static images, or simulated stage progress in production paths.
- **No hardcoded model**: provider and model come from the request or env (`DEFAULT_PROVIDER`, `DEFAULT_MODEL`). Orchestration never imports an adapter directly; go through `ProviderRegistry`.
- **Secrets**: `x-provider-api-key` stays in memory for one run. Production path is header-only; for local development only, `OPENROUTER_API_KEY` or `GROQ_API_KEY` in the gitignored `.env` is a fallback (header wins, `NODE_ENV=production` ignores it). Never persist, log, or echo a key. `x-project-key` is the project boundary; only its SHA-256 hash is stored.
- **Real stages**: stage state comes from persisted `generation_stages` rows. Do not add fake delays or optimistic stage transitions.
- **Persistence**: access the database only through repository interfaces. Keep PGlite and Postgres interchangeable; no SQL in controllers or generators.
- **Validation**: validate external data with Zod at the HTTP boundary and model output with contracts. No `any` without a documented reason.
- **Strict TypeScript**: ESM imports need `.js` suffixes. Keep the build clean.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/common/` | Envelope, errors, access guard, validation, redaction, database-error translation. |
| `src/config/` | Zod env contract; the only place that reads `process.env`. |
| `src/database/` | Schema, migrations, repository interfaces and Drizzle implementations. |
| `src/providers/` | `ModelProvider`, registry, OpenRouter adapter, mock, prompts, schema sanitizer. |
| `src/generation/` | Run service, DB-backed single worker, requirements/architecture generators. |
| `src/projects/`, `src/requirements/`, `src/architecture/` | Controllers and domain services. |
| `src/auth/` | Register/login/logout, scrypt password hashing, opaque sessions. |
| `src/account/` | Saved provider config and user preferences. |
| `src/analytics/` | Dashboard usage aggregation. |
| `src/plans/` | Free/Pro limits and upgrade gates. |
| `src/architecture/validator.ts` | Structural + semantic validation of the merged model. |

## Database changes

1. Edit `src/database/schema.ts`.
2. Run `npm run db:generate` and review the SQL in `drizzle/`.
3. Update `docs/Data-Model.md`.
4. Add or extend the PGlite repository test.

Migrations apply automatically at boot in `DatabaseService`; there is no migrate command.

## Generation changes

- Requirements: two attempts total (initial + one repair).
- Architecture: three attempts per phase (initial + two repairs).
- Exhausted repair must fail with `GENERATION_REPAIR_FAILED`, not leak `INVALID_MODEL_OUTPUT`.
- Keep one active run per project; the partial unique index in `schema.ts` is the race-safe guard.
- Persist validated phase results so a failed later phase can reuse them.
- Scoped regeneration must preserve untouched sections exactly and prune stale learning refs.

Update `docs/Generation.md` when stage order, repair policy, reuse, or conflict behavior changes.

## Testing rules

- New non-trivial logic gets one runnable check: assert-based unit, repository integration, or e2e.
- New provider failure behavior gets a scripted-fetch test in `test/unit/openrouter.provider.spec.ts`.
- New HTTP behavior gets an e2e assertion on the envelope.
- New database behavior extends `test/unit/database.repositories.spec.ts`.
- Never weaken an assertion to make a failure pass.

## Documentation

Docs describe implemented behavior. When a change affects architecture, API, data model, generation, providers, or testing, update the matching file in `docs/` and keep wiki links intact. Start at `docs/Home.md`.

Related: [[Home]] · [[Architecture]] · [[API]] · [[Data-Model]] · [[Generation]] · [[Providers]] · [[Testing]]
