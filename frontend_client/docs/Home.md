# Frontend Docs — System Design All-in-One

Living documentation for `frontend_client/` (Next.js 16). Keep in sync with the code; docs describe what IS, not what is planned (planned = `initial-docs/Roadmap-Planner-Frontend`).

## Notes

| Note | What it covers |
| --- | --- |
| [[API-Client]] | `lib/api/client.ts` — envelope unwrapping, `ApiError`, error-code → message map, secret headers. |
| [[Design-System]] | Tokens, shadcn setup, dark mode, reduced motion, motion vocabulary, `@sda/contracts` usage. |
| [[Requirements-Flow]] | Requirements page: run polling, editor, confirm → architecture hand-off. |
| [[Workspace-LLD]] | Workspace: LLD + HLD scene mapping, canvases (pan/zoom, flow exploration), selection, details panels, DSA cards + comparison table, regeneration. |
| [[Portal]] `/library|dashboard|settings` | Sessions, route access control, library pagination/status filter, provider defaults, user preferences, analytics dashboard, hydration-guard decision. |
| [[Auth-Flows]] `/login|forgot-password|reset-password|verify-email` | Memory-only access tokens + refresh cookie, CSRF, verification banner, account deletion. |
| [[Billing]] `/pricing|billing/*` | Plan catalogue, checkout (Stripe or local stub), success/cancel, settings billing card, plan gate. |
| [[Export]] `/projects/[id]/export` | Client-side export/PDF: document composition, SVG serialization, light paper palette, print CSS, fit-to-page diagrams, limitations. |
| [[Responsive-States]] | F6 hardening: breakpoint layout (≥1024 / 768–1023 / <768), use-media-query, sheets, skeletons, validation banners, guided-resume guard, operator details (throttle, e2e). |

## Build facts (learned the hard way — do not regress)

- **Turbopack root MUST be set** in `next.config.ts` to the workspace root. `frontend_client` is its own git repo, so Turbopack otherwise ignores the root workspaces `package.json` and fails to resolve hoisted deps (`react` not found). `__dirname` works in the CJS-compiled config; `import.meta.url` does not.
- npm workspaces install from the repo root; `frontend_client/package-lock.json` is intentionally gone (one root lockfile).
- shadcn is the current **base-nova** style — components import `@base-ui/react` (Base UI primitives) and `cn` (published helper), not Radix. `TooltipProvider` takes no `delayDuration` prop.
- Vitest 5 runs inside the monorepo; its config-loader warning about ESM/CJS is cosmetic (fixable later by setting `"type": "module"` — do NOT do casually, Next must stay compatible).
- Checks: `npm run lint`, `npm run test`, `npm run build` (all from repo root with `--workspace frontend_client`, or cd into `frontend_client`).

## Commands

| Where | Command |
| --- | --- |
| repo root | `npm run dev:frontend` / `npm run build:frontend` |
| `frontend_client/` | `npm run dev` · `npm run build` · `npm run lint` · `npm run test` |
| `frontend_client/` | `npm run test:e2e` — Playwright journey (boots/reuses :3000 + mock :3001). |

Env: `NEXT_PUBLIC_API_URL` (see `.env.example`, default `http://localhost:3001`).

## Related

- `initial-docs/[[Roadmap-Planner-Frontend]]` — phase plan this docs set implements.
- `initial-docs/[[Tech-Stack]]`, `initial-docs/[[Project-Overview]]`.
- Backend owns `backend-server/`; shared contracts live in `packages/contracts/` (`@sda/contracts`).
