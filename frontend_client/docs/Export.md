# Export / Print

Client-side export: `/projects/[id]/export` renders the canonical model as a printable document; **Print / Save as PDF** calls `window.print()` (browser dialog — see limitations). Related: [[Workspace-LLD]], [[Portal]], [[API-Client]].

## Flow

- Workspace header **Export** button → export route. Disabled while the workspace has no model (`model === null`) — you cannot export what does not exist.
- The route reuses the workspace query keys (`queryKeys.project` / `architecture`), so opening it right after the workspace is instant (shared cache). Access follows the D2 rule: project key **or** owner Bearer (`export-flow.tsx`).
- Refusal paths are JourneyShell error cards, never a blank sheet: no access, query failure (retry), `version === null` (no architecture yet), or `validation.valid === false` (export blocked — an invalid model must not print as a trusted document).

## Document sections (`export-document.tsx`)

Cover (idea, version, dates, validation verdict + counts) → requirements (functional/non-functional/clarifications/assumptions) → HLD (diagram + components + flows) → LLD (diagram + classes + relationships + patterns) → DSA (`WorkspaceDsa`, flattened for paper) → learning steps → validation notes → footer. Every string derives from contract fields (`lib/export/document.ts`, unit-tested) — nothing is invented. **Raw contract ids never print**: rows are numbered instead (`fr_…`/`nfr_…`/`q_…`/`asm_…`, learning-step element refs, validation rule/path) — ids stay as React keys only. `.export-doc` also paints its own paper (`background-color` + `color` from the scoped tokens), otherwise the page shell's dark backdrop shows through and scoped text lands on it.

## Diagrams on paper

- The same scene pipeline as the workspace (`buildLldScene` / `buildHldScene`) renders into `.export-diagram` boxes (620px tall). The canvas fit-on-resize hook re-fits automatically; the document container is pinned to **690px on screen and in print** (`main { width: 690px }` in the print block) so the fitted state is valid on paper — nothing clips.
- **Download SVG** (per diagram) serializes the live SVG with computed styles inlined (`lib/export/svg.ts`) — the export page is already light-scoped, so the file is light-themed too.

## Light theme + print rules (`globals.css`)

- **On screen the export page stays in the app's dark brand theme** (user decision: no white page); `.export-doc` only paints its surface from the active tokens (`background-color`/`color`), which keeps every heading/meta/diagram text visible instead of blending into the shell.
- **Print flips to light paper**: `@media print` re-scopes the full token set once (`.export-doc` + `:root`), so text, utilities, and SVG fills print as dark-on-white under any app theme. Also in the print block: hide `.no-print` chrome (header, buttons), pin the content width, `break-inside: avoid` on sections/diagrams/definition rows, `break-after: avoid` on headings, `thead { display: table-header-group }`. `@page { size: A4; margin: 14mm 12mm }`.
- Ops note: **restart `npm run dev` after CSS-only edits** — globals.css HMR misses served stale print/light rules twice.

## Limitations (deliberate)

- **Browser print dialog, not one-click PDF.** One-click would need jsPDF/html2canvas (poor SVG fidelity) or server-side Playwright rendering — deferred until users ask.
- **Page numbers** come from the browser's print header/footer option; Chromium ignores `@page` margin-box counters.
- **Large diagrams scale to fit one page** (fit-to-page, both dimensions) — no clipping, but a 40-class LLD can get small. Rank-based pagination across pages is *not* implemented; split it if users hit it.
- Dark palette for the app itself stays dark-only (recorded decision); light exists for paper.

## Tests

- Unit: `lib/export/document.test.ts` (cover/rows/warnings/date), `lib/export/svg.test.ts` (standalone XML, inline styles preserved, live element untouched, filename slugs).
- Playwright `e2e/export.spec.ts`: full document render, `emulateMedia("print")` chrome-hidden check + **A4 PDF buffer smoke** (asserted `%PDF-` + non-empty, written to `test-results/export-smoke.pdf`), SVG download contents, missing/invalid model cards, signed-out access card, and the `?next=` sign-in round-trip.
