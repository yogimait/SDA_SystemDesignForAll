# frontend_client — System Design All-in-One

Next.js 16 App Router frontend for the LLD/HLD/DSA architecture learning
platform.Scoped to this directory; shared Zod contracts live in
`packages/contracts` (`@sda/contracts`) and the NestJS API in
`backend-server/`.

## Run

Packages are installed from the repo root (npm workspaces; this package has no
local lockfile, and `turbopack.root` in `next.config.ts` must stay pointed at
the workspace root):

```bash
cd ..                # repo root
npm install
```

Run both dev servers (two terminals):

```bash
# frontend on :3000
npm run dev

# mock-provider backend on :3001 (no API key needed for local demos)
cd ../backend-server
$env:MOCK_PROVIDER="1"; $env:PORT="3001"; npm run start:dev
```

With the mock backend, walk the full journey from the landing page: submit an
idea → generate requirement proposals → confirm the specification → the
architecture generates → open the collaborative workspace (LLD / HLD / DSA
tabs, outline, details, guided learning steps).

Using a real provider: enter an OpenRouter key in the landing "Provider
setup" dialog (BYOK; the key travels only via the `x-provider-api-key` header
and is never persisted).

## Checks

All from this directory before shipping a change:

```bash
npm run lint       # eslint
npm run test       # vitest unit tests (72 tests)
npm run build      # next build (strict TypeScript)
npm run test:e2e   # Playwright UI journey vs the live dev servers
```

`test:e2e` boots/reuses the frontend dev server (:3000) and a mock backend
(:3001, `MOCK_PROVIDER=1`, raised throttle limit) — see
`playwright.config.ts`. First run downloads Chromium (`npx playwright install
chromium`).

The Impeccable detector runs on `app` for design-quality checks
(`impeccable detect app --json`, findings on stderr).

## Layout

| Path | Responsibility |
| --- | --- |
| `app/` | Routes: landing `/`, `projects/[id]/requirements`, `projects/[id]/workspace` (PPR, `cacheComponents` on). |
| `components/` | Landing (idea form, provider dialog), requirements (spec editor, run progress), workspace (shell, sidebar, details, DSA view), diagram (LLD SVG renderer, HLD SVG renderer), `ui/` primitives. |
| `lib/diagram/` | dagre layout + scene builders for the UML class diagram and HLD system diagram (custom SVG renderer, no React Flow). |
| `lib/api/` | Envelope-aware fetch client (`lib/api/client.ts`) — error-code → user-message table, secret headers, Zod response validation. |
| `hooks/` | `use-generation-run` polling, `use-media-query` breakpoints. |
| `e2e/` | Playwright journey tests. |

## Docs

Living docs (Obsidian-style wiki links) start at `docs/Home.md`:
architecture map, design system, API client rules, workspace and diagram
views. Planning docs: `../initial-docs/Roadmap-Planner-Frontend.md`.
