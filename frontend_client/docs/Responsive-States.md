# Responsive & States (F6 hardening)

What ships in the workspace and requirements UI to survive real screens and
real failures. Implements the [[Roadmap-Planner-Frontend]] F6 phase. Related:
[[Workspace-LLD]] · [[Design-System]] · [[API-Client]] · [[Requirements-Flow]].

## Breakpoint layout

Driven by `hooks/use-media-query.ts` — an SSR-safe `matchMedia` hook (false
during prerender, live-updated on `change`):

| Range | Layout |
| --- | --- |
| ≥1024px (`isDesktop`) | Three resizable regions: outline / canvas / details (`react-resizable-panels`), focus-mode toggle in header. |
| 768–1023px | Outline stays inline (`aside w-44`); details opens as a right-side `Sheet` from a header "Details" button. |
| <768px (`isPhone`) | Stacked: diagram full-width; outline opens as a left `Sheet`, details as a bottom `Sheet` (`h-[72dvh]`). |

Key implementation choices:

- `workspace-flow.tsx` builds `canvasNode` / `outlineNode` / `detailsNode` as
  shared fragments once, then the desktop resizable branch and the narrow
  sheet branch reuse them — one render path per view, no duplication.
  All three are null-guarded (`model` / scenes can be null while queries are
  in flight), since they are built before the conditional branches.
- The focus-mode button renders only on desktop; the Outline/Details buttons
  only below 1024. DSA view (single-column) renders sheets/buttons nowhere.
- Deliberately skipped: auto-closing an open sheet when crossing a breakpoint.
  The open modal hides the background from the accessibility tree (Base UI
  modal behavior), so tests must close the sheet before asserting on the
  header again — see the e2e sweep.

## Systematic states

- **Skeleton loading**: workspace initial load renders an aria-busy skeleton
  shell (header strip + three panel shapes) instead of a text placeholder.
- **Validation**: `ValidationBadge` shows three states — `invalid`
  (destructive, blocking errors), `validated · N warnings` (amber), clean
  (green). Non-blocking warnings render an amber banner under the header;
  blocking errors never render a diagram — the DSA block is replaced by a
  "validation failed" card with a link to the requirements editor.
- **Empty states**: any group lacking items shows guidance text; the DSA view
  shows a friendly message when no recommendations were generated.
- **Error + retry**: query errors render `ErrorCard` with a Retry button
  (refetches project + architecture); regeneration errors render a red banner
  with Retry + Dismiss in the header area.

## Provider error UX

`lib/api/client.ts` maps every registered error code (auth, rate-limit,
timeout, invalid output, quota…) to an actionable user message; unit tests
cover the whole table ([[API-Client]]). Retry affordances: RunProgress Retry
for run failures, the regen banner Retry, and `ErrorCard` Retry for query
failures.

## Guided-mode resume (session state)

- Entering guided mode persists `sda:guided:<projectId>` (cursor index) in
  `sessionStorage`; exiting removes it.
- Resume fires **only when the key exists** — the guard is
  `saved !== null` before `Number(saved)`. `Number(null)` is `0`, which would
  otherwise auto-start guided mode on every fresh workspace load
  (regression caught by the e2e journey).

## Operator facts (learned the hard way)

- Backend default throttle is `THROTTLE_LIMIT=10` per `THROTTLE_TTL_MS=1h`
  (`backend-server/src/config/env.ts`). Repeated manual UI/API probing or
  e2e reruns exhaust it → `QUOTA_EXCEEDED` 429. The e2e mock backend boots
  with `THROTTLE_LIMIT=1000` via `playwright.config.ts` webServer env.
- Never launch a second `nest start --watch` while one is running: watchers
  respawn the server (`EADDRINUSE` → exit → respawn roulette), can win the
  port with the wrong env (mock off → `PROVIDER_AUTH_FAILED`), and can corrupt
  `dist/` and the PGlite `.data/pglite` dir mid-rebuild. Recovery: kill the
  whole process tree (`Win32_Process CommandLine match`), `npm run build`,
  delete `.data/pglite`, boot exactly one server.
- Playwright gotchas: Base UI modal dialogs hide the background subtree from
  role queries (close the sheet before asserting header content);
  `aria-label`ed `<section>` maps to role `region`; SVG `<title>` is a child
  element (`svg:has(> title:text-is('…'))`); LLD marker ids are
  `marker-<kind>` (`defs marker[id^='marker-']`).
- Vitest would import `e2e/*.spec.ts` — `vitest.config.ts` excludes `e2e/**`.

## e2e coverage

`e2e/journey.spec.ts` (both green, ~11s total):

1. **Happy journey** — landing → idea → "Generate requirements" → confirm →
   workspace: LLD SVG + markers + legend, keyboard select/clear, HLD diagram +
   line-style legend, DSA cards + comparison table, guided run start → last
   step → exit, then the automated responsive sweep (390 / 900 / 1440).
2. **Provider failure path** — Playwright route interception fakes a 402
   `PROVIDER_RATE_LIMITED` envelope on `POST /api/projects/*/architecture`
   (POST-only); asserts the mapped "rate-limiting" message and that Confirm
   stays enabled as the retry affordance.

Manual viewport sweep at 1280×800 / 834×1112 stays a human check (planner
note).
