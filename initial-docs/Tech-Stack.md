# Tech Stack

Focused stack for the MVP. Two rules govern every choice below: **SOLID with pragmatic reuse** (abstractions only where a boundary is real — model providers, persistence, diagram rendering) and **no invented complexity** (no Docker, no Redis, no suite of speculative services).

## Summary

| Layer | Choice | Why this choice |
| --- | --- | --- |
| Frontend framework | Next.js 16 (App Router), React 19.3, TypeScript strict | Already scaffolded; workspace is a highly interactive client app; App Router fits landing + project routes. |
| Styling / UI | Tailwind CSS v4 + shadcn/ui | Token-based design system without a runtime dependency; shadcn components are owned source, easy to restyle. |
| Data fetching | TanStack Query | Caching, run polling, and retry logic without hand-rolled sync code. |
| Backend | NestJS 12 (Express), TypeScript strict, Vitest + oxlint | Already scaffolded; module/DI system fits provider adapters, repositories, and the generation orchestrator cleanly. |
| Validation / contracts | Zod 4 in a shared `packages/contracts` package (root npm workspaces) | One source of truth for DTOs, the canonical architecture model, and the API envelope, consumed by both apps. |
| Database | Drizzle ORM + drizzle-kit; **PGlite** locally, `pg` driver for production Postgres | PGlite is real Postgres (WASM) with zero infrastructure — meets the "Postgres now, no Docker" constraint. Drizzle supports both PGlite and `pg` on the same schema, keeping the Supabase/managed-Postgres path open behind repository interfaces. |
| Diagrams | Custom SVG renderer + `@dagrejs/dagre` layout | Precise UML notation (hollow triangles, diamonds, dashed dependencies, multiplicities), full styling control, progressive reveal, replaceable later without touching the canonical model. No React Flow. |
| Model provider | **OpenRouter**, model **GLM-5.3 Flash**, BYOK | Current focus. A `ModelProvider` interface keeps Groq/Gemini adapters addable later without touching orchestration. |
| Async generation | Postgres-backed run/stage rows + in-process worker (concurrency 1), client polling | Survives refreshes, reports real stage state, no Redis for an MVP with one backend instance. |

## Frontend

- **Next.js 16 App Router** with Turbopack and `cacheComponents: true` (already enabled in `frontend_client/next.config.ts`). Client pages are fully interactive; dynamic APIs are async (`PageProps`/`LayoutProps` helpers). Landing page stays lightweight.
- **Routes**: `/` landing → `/projects/[id]/requirements` → `/projects/[id]/workspace`.
- **shadcn/ui** with Tailwind v4 tokens in `globals.css` — set up on the current **base-nova** style, so components are built on **Base UI** (`@base-ui/react`) primitives rather than the older Radix-based style (decided 2026-10-23 during Phase F0; visually equivalent, owned-source components, restylable the same way). Technical, restrained aesthetic: neutral base palette, one accent color, mono font for identifiers and complexity chips. Important for any local dev setup: `turbopack.root` in `next.config.ts` must point at the repo root so hoisted workspace deps resolve.
- **API client** (`lib/api`): unwraps the API envelope (`{ status, statusCode, data }` / `{ status, statusCode, message, error }`), maps registered error codes to actionable messages.
- **BYOK handling**: keys live in `sessionStorage`, entered in a dialog, never stored in app state passed to diagram components, URLs, or persisted anywhere.
- Frontend runs on port **3000**.

## Backend

- **NestJS 12**, module-per-responsibility:
  - `common` — API envelope interceptor + exception filter, shared error-code registry, Zod validation pipe, throttling, logging with secret redaction.
  - `providers` — `ModelProvider` interface, registry, OpenRouter adapter, capability flags, schema conversion.
  - `projects` / `requirements` — CRUD, confirmation state, guard.
  - `generation` — orchestrator, named stages, bounded repair, run persistence, in-process worker.
  - `architecture` — canonical validation (structural + semantic), versioning, scoped regeneration.
  - `database` — Drizzle service + repository implementations behind interfaces.
- Backend runs on port **3001** (config default; avoids the Next.js 3000 collision).
- All JSON responses use the mandated envelope. Error codes are registered in one module (`VALIDATION_ERROR`, `PROJECT_NOT_FOUND`, `PROVIDER_AUTH_FAILED`, `PROVIDER_RATE_LIMITED`, `INVALID_MODEL_OUTPUT`, `GENERATION_REPAIR_FAILED`, `QUOTA_EXCEEDED`, `DATABASE_UNAVAILABLE`, …).

## Database (no Docker)

- **PGlite** (`@electric-sql/pglite`) is a real Postgres engine compiled to WASM. Local dev and tests use it with a on-disk data dir (`.data/pglite`); tests may use an in-memory instance. No server process, no install.
- **Drizzle ORM** defines the schema once; `drizzle-kit` generates SQL migrations that run unchanged against PGlite now and `pg`-connected Postgres later.
- Drizzle drives used per environment: `drizzle-orm/pglite` (dev/test) and `drizzle-orm/node-postgres` (production). Selection is a driver factory, hidden behind repository interfaces.
- Tables: `Project`, `ProjectAccess` (hashed per-project access key), `Requirement`, `Assumption`, `ClarificationQuestion`, `GenerationRun`, `GenerationStage`, `ArchitectureVersion` (canonical model as JSONB).
- **Limitation**: PGlite is single-process/single-connection. Acceptable for MVP (one API instance, worker concurrency 1). Production must use `pg` against managed Postgres.

## Contracts package

- Root npm workspaces create `packages/contracts` (`@sda/contracts`), built with `tsc`, imported by both apps.
- Contents: API envelope types, request/response DTOs, the **canonical ArchitectureModel schema** (requirements, LLD classes/relationships/patterns, HLD components/connections/flows/tech decisions/bottlenecks, DSA recommendations with layer annotations, learning steps with element refs), and the error-code union.
- The canonical model is generated and validated on the backend; the frontend infers types from the same schema and additionally validates fetched payloads at runtime.

## Model access — current focus: OpenRouter + GLM-5.3 Flash

**Provider abstraction**

```ts
interface ModelProvider {
  id: string;
  generateStructured(input: {
    model: string;
    system: string;
    messages: ChatMessage[];
    schemaName: string;
    jsonSchema: JsonSchemaObject;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{ data: unknown; usage?: TokenUsage }>;
}
```

- **OpenRouter adapter** (the only adapter in the MVP): base URL `https://openrouter.ai/api/v1/chat/completions`, key forwarded from the client header as `Authorization: Bearer …`.
- **Model**: GLM-5.3 Flash, verified against OpenRouter's model list: slug `z-ai/glm-5.3-flash`, context length 1,048,576, supports `response_format` and `structured_outputs`. The slug is a config value (`DEFAULT_MODEL`), never hardcoded in orchestration logic.
- **Structured output strategy**, tried in order per model capability: (1) `response_format: { type: "json_schema", …, strict: true }` with provider `require_parameters` routing; (2) `json_object` mode with the JSON Schema inlined in the system prompt; (3) prompt-only JSON with tolerant extraction. Zod → JSON Schema conversion (with sanitization for provider quirks) lives in the adapters layer, not in orchestration.
- **Generation config**: low temperature (≈0.2), per-stage `maxOutputTokens` budgets (LLD/DSA 64k), per-request timeout via `AbortController`, usage (prompt/completion tokens) captured per run for duration/cost tracking. `OPENROUTER_REASONING_EFFORT` defaults to `low` because reasoning tokens share `max_tokens`, but even low effort consumes a large share on GLM-5.3 Flash.
- **Error normalization**: provider failures map to typed errors (`auth`, `rate_limit`, `timeout`, `invalid_output`, `context_length`, `unsupported`), then to registered envelope error codes. Bounded retry (max 2 repair attempts) applies to invalid structured output only; truncated output fails fast with its provider reason.
- **Later adapters** (same interface, no orchestration changes): Groq, Gemini.

**BYOK flow**

1. Production: user pastes an OpenRouter key in the provider dialog, stored in `sessionStorage` (per tab, cleared on close).
2. Each generation request carries `x-provider-api-key`.
3. Backend uses the key for the run, redacts it from all logs, and persists nothing.
4. Local development only: `backend-server/.env` may set `OPENROUTER_API_KEY` as a fallback. The request header wins; `NODE_ENV=production` ignores the fallback; `.env` is gitignored.

## Diagram rendering

- `DiagramCanvas` (shared shell): wheel zoom, pan, fit-to-view, keyboard controls (`+`/`-`/`0`), SVG `viewBox` transform.
- **UML renderer**: class boxes with name/attribute/method compartments; correct notation per relationship kind — inheritance (hollow triangle), realization (dashed + hollow triangle), association (arrow), aggregation (hollow diamond), composition (filled diamond), dependency (dashed + open arrow); multiplicity labels at both ends.
- **HLD renderer**: distinct component shapes per type (client, gateway, service, store, cache, broker, worker, external, observability), directional labeled edges, sync vs async distinction beyond color (line style + label).
- **DSA**: structured panels and comparison tables, not a diagram.
- Progressive reveal (guided mode) dims/highlights existing elements; layout never re-runs mid-lesson.

## Testing

| Area | Tool | Focus |
| --- | --- | --- |
| Backend unit | Vitest | Envelope, validation rules, repair loop, adapter normalization, schema conversion, orchestrator stages. |
| Backend integration | Vitest + PGlite | Repositories, run/stage persistence, access guard. |
| Backend e2e | Vitest + supertest | Full journey with a deterministic fake provider; failure paths. |
| Frontend unit | Vitest + Testing Library | API client, requirements editor logic, model→scene mapping, guided-step reducer. |
| Frontend e2e | Playwright | Landing → requirements → workspace happy path + provider-failure path. |
| UI quality | Impeccable detector | Run on the workspace and landing before calling frontend work done. |

`MOCK_PROVIDER=1` exists for tests and local demos only; production behavior always routes through the real adapter.

## Local commands

| Where | Command | Purpose |
| --- | --- | --- |
| root | `npm install` | Installs workspaces (contracts + both apps). |
| root | `npm run dev:backend` / `npm run dev:frontend` | Runs Nest (3001) and Next (3000). |
| backend | `npm run test` / `npm run test:e2e` | Unit / e2e suites. |
| backend | `npm run db:generate` | Drizzle schema → SQL migration; migrations apply at boot. |
| frontend | `npm run build` | Next 16 production build (Turbopack). |

Backend implementation docs live in [`backend-server/docs/`](../backend-server/docs/Home.md).

Related: [[Project-Overview]] · [[Roadmap-Planner-Frontend]] · [[Roadmap-Planner-Backend]]
