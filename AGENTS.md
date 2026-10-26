# Project Rules — System Design All-in-One

Extends the global rules in `~/.config/opencode/AGENTS.md`. Read the planning docs in `initial-docs/` before any work: start at `initial-docs/Home.md`; [[Tech-Stack]] drives technology decisions, [[Roadmap-Planner-Frontend]] and [[Roadmap-Planner-Backend]] drive sequencing and checkpoints.

## Layout

- `frontend_client/` — Next.js 16.4.2 App Router (its own AGENTS.md re-adds version warnings — obey the bundled docs in its `node_modules/next/dist/docs/`).
- `backend-server/` — NestJS 12, ESM.
- `packages/contracts/` — Zod 4 contracts shared by both apps (created in Phase B0/F0; root npm workspaces).
- `initial-docs/` — planning vault (Obsidian-style wiki links between notes).
- Each sub-app has its own git repo; the workspace root is not a git repo.

## Non-negotiable conventions

- **API envelope**: every JSON response passes through `ok()`/`fail()` helpers — `{ status, statusCode, data }` on success, `{ status, statusCode, message, error: { code, details } }` on failure. Error codes live in one registry module.
- **Contracts are single source of truth**: DTOs, canonical `ArchitectureModel` schema, and envelope types come from `@sda/contracts`. Never redefine a contract inline in either app.
- **Canonical model only**: LLD/HLD/DSA UI renders from the validated canonical architecture model fetched from the API. Never ship hardcoded example architectures, static images, or mock diagram interactions as production behavior. Fixtures belong in tests/dev demos (`MOCK_PROVIDER=1`) only.
- **No React Flow** in the diagrams; custom SVG renderer + dagre layout behind a replaceable renderer boundary.
- **No Docker in local dev**: PGlite via Drizzle for dev/tests; `pg` + `DATABASE_URL` is the production path. Keep DB access behind repository interfaces.
- **Secrets**: provider keys stay in `sessionStorage` client-side, travel via `x-provider-api-key`, are redacted from logs, never persisted server-side. Project access uses `x-project-key`. Never write keys/secrets to logs, DB rows, error messages, or analytics.
- **Real progress only**: generation stage state must reflect persisted `generation_stages` rows; no simulated loading stages.
- **Models configurable**: never hardcode model slugs in orchestration; provider/model come from request or env (`DEFAULT_PROVIDER=openrouter`, `DEFAULT_MODEL` for GLM-5.3 Flash).
- **Strict TypeScript** both apps; no `any` without a documented reason; validate external data at runtime with Zod.

## Ports and commands

| App | Port | Dev command |
| --- | --- | --- |
| frontend_client | 3000 | `npm run dev` (in `frontend_client/`) |
| backend-server | 3001 | `npm run start:dev` (in `backend-server/`); check `PORT` env |

Backend checks: `npm run test`, `npm run test:e2e`, `npm run lint` (oxlint). Frontend checks: `npm run lint`, `npm run build`. UI work is not done until the Impeccable detector passes on affected routes.

## Working style

- Follow the phase planners; complete a phase's checkpoint list before opening the next phase.
- Non-trivial logic ships with its minimal runnable check per the global testing rules.
- Update planner checkboxes and statuses as work lands; keep [[Tech-Stack]] honest with reality.
