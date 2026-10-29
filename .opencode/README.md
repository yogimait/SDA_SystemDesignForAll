# Agent Roster — System Design All-in-One

This repository uses a small, curated agent roster. The primary session is the orchestrator; agents are invoked as subagents per task.

## Precedence

1. `~/.config/opencode/AGENTS.md` — global rules. Always apply. Never overridden by this roster.
2. `AGENTS.md` (repo root) — project rules.
3. App-level `AGENTS.md` — backend/frontend specifics.
4. Agent definitions below.

If an agent instruction conflicts with a global rule, the global rule wins.

## Global agents (`~/.config/opencode/agent/`)

| Agent | Scope | Model |
| --- | --- | --- |
| `backend-engineer` | Generic backend: APIs, DB, auth, jobs, reliability | `opencode-go/deepseek-v4.1-flash` |
| `frontend-engineer` | Generic frontend: React/Next.js, state, data fetching, a11y | `opencode-go/deepseek-v4.1-flash` |
| `ui-ux-designer` | Generic UI/UX: design systems, hierarchy, responsive, accessibility | `opencode-go/mimo-v2.6-flash` (GLM only by explicit request) |

Global agents are reusable across projects. They read the target project's `AGENTS.md` before working.

## Project agents (`.opencode/agent/`)

| Agent | Scope | Model |
| --- | --- | --- |
| `sda-backend` | `backend-server/` + backend side of `packages/contracts/` | `opencode-go/deepseek-v4.1-flash` |
| `sda-frontend` | `frontend_client/` implementation | `opencode-go/deepseek-v4.1-flash` |
| `sda-ui-ux` | Visual design, layout, responsive, accessibility, polish | `opencode-go/mimo-v2.6-flash` (GLM only by explicit request) |
| `backend-tester` | Backend API/DB/auth/generation/security QA | inherits session model |
| `ui-ux-tester` | UI/UX, flows, buttons, APIs from the browser | inherits session model |

## Routing

- Server code, migrations, auth, generation, API contracts → `sda-backend`.
- Client routes, hooks, data fetching, wiring, tests → `sda-frontend`.
- Visual hierarchy, layout, design-system, responsive, accessibility → `sda-ui-ux`.
- Backend QA → `backend-tester`.
- UI/UX and flow QA → `ui-ux-tester`.

A task that spans frontend and backend is split: contracts first, then backend, then frontend, then QA.

## QA gates

- Backend: `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e`.
- Frontend: `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`.
- UI: Impeccable detector on affected routes.
- QA agents report evidence; they do not modify product code.

## Model choices

- UI/UX design: `opencode-go/glm-5.3-flash` (visual/design strength, lower token cost).
- Backend/frontend implementation: `opencode-go/deepseek-v4.1-flash`.
- QA: inherits the orchestrator unless a task needs a specific model.

## Reference

`agency-agents` (https://github.com/msitarzewski/agency-agents) is used as inspiration for role structure, not as a runtime dependency. Only curated roles are adopted; its full roster is not installed.

## Adding agents

- Reusable role → add to `~/.config/opencode/agent/`.
- Project-specific role → add to `.opencode/agent/` and reference the app `AGENTS.md`.
- Keep the roster small. Add a role only when a real domain appears (devops, marketing, sales).
