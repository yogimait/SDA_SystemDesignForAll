<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend build notes (agent-maintained)

Scope: `frontend_client/` only. Planning: `../initial-docs/Roadmap-Planner-Frontend.md`. Living docs: `docs/Home.md` (frontend-local), read before extending.

- Workspaces: packages install from the repo root (`npm install` there). Never recreate a local lockfile; `turbopack.root` in `next.config.ts` MUST stay pointed at the workspace root.
- Checks before done: `npm run lint` + `npm run test` + `npm run build` in this directory, and the Impeccable detector on affected routes.
- Envelope/api rules: `docs/API-Client.md`. Token rules: `docs/Design-System.md`. All response shapes come from `@sda/contracts` (repo-root `packages/contracts`) — never re-define a payload schema inline.
- secrets: keys travel only via `x-provider-api-key` / `x-project-key` headers through `lib/api/client.ts`; never in URLs, state passed to diagrams, or logs.
- Next 16 changes vs. older training data: type helpers `PageProps`/`LayoutProps` are global; `cacheComponents: true` is on; config is compiled to CJS (`__dirname` works, `import.meta.url` does not).

