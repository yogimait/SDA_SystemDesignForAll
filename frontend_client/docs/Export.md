# Export / Print

Client-side export: `/projects/[id]/export` renders the canonical model as a printable document; **Print / Save as PDF** calls `window.print()` (browser dialog — see limitations). Related: [[Workspace-LLD]], [[Portal]], [[API-Client]].

## Flow

- Workspace header **Export** button → export route. Disabled while the workspace has no model (`model === null`) — you cannot export what does not exist.
- The route reuses the workspace query keys (`queryKeys.project` / `architecture`), so opening it right after the workspace is instant (shared cache). Access follows the D2 rule: project key **or** owner Bearer (`export-flow.tsx`).
- Refusal paths are JourneyShell error cards, never a blank sheet: no access, query failure (retry), `version === null` (no architecture yet), or `validation.valid === false` (export blocked — an invalid model must not print as a trusted document).

## Document sections (`export-document.tsx`)

Cover (idea, version, dates, validation verdict + counts) → requirements (functional/non-functional/clarifications/assumptions) → HLD (diagram + components + flows) → LLD (diagram + classes + relationships + patterns) → DSA (`WorkspaceDsa`, flattened for paper) → learning steps → validation notes → footer. Every string derives from contract fields (`lib/export/document.ts`, unit-tested) — nothing is invented. **Raw contract ids never print**: rows are numbered instead (`fr_…`/`nfr_…`/`q_…`/`asm_…`, learning-step element refs, validation rule/path) — ids stay as React keys only. `.export-doc` also paints its own paper (`background-color` + `color` from the scoped tokens), otherwise the page shell's dark backdrop shows through and scoped text lands on it.

## Diagrams on paper

- The same scene pipeline as the workspace (`buildLldScene` / `buildHldScene`) renders into `.export-diagram` boxes (620px tall on screen). Each diagram section (`.export-diagram-page`) prints on its **own A4 landscape page** (`@page export-diagram`), roughly 50% more width than portrait, so the fit-to-page scale stays legible. In print the box grows to **174mm** — the landscape printable height is 190mm (210mm − 2 × 10mm margin) and the heading measures ~16mm, so one diagram always fits one page while using ~92% of the printable height. The workspace marker/type legends are hidden on paper (`.diagram-legend`), handing that space to the drawing. `use-diagram-viewport` listens for `beforeprint` and re-fits the live SVGs to the print box; the print box is taller than the 620px screen box, so a missed refit cannot clip.
  - Ops fact: the named page must **not** be called `diagram`. Chromium 156 silently ignores a landscape `@page diagram` and prints portrait pages (found through `page.pdf` MediaBox inspection) — any other identifier works.
- **Diagrams only** (toolbar toggle, `aria-pressed`): `data-print-scope="diagrams"` hides every `.export-text-section` in print and drops the first/trailing page breaks, so printing emits **exactly the two landscape pages** (HLD + LLD) instead of the full report; toggling off restores the full document. The print button prints whichever scope is active.
- Canvas zoom controls carry `.no-print` (interaction chrome, not paper); legends are print-hidden as above.
- **Download SVG** (per diagram, next to its heading) serializes the live SVG with computed styles inlined (`lib/export/svg.ts`). It strips the fitted pan/zoom transform (`data-diagram-root`) and writes the scene's native `viewBox`/`width`/`height`, so the file is the full-resolution fallback; the print toolbar states this next to **Print / Save as PDF**.
- **Back to workspace** in the header resolves the route id client-side (`components/export/back-to-workspace.tsx`, `useParams` inside Suspense) — never a params-promise cast.

## Light theme + print rules (`globals.css`)

- **On screen the export page stays in the app's dark brand theme** (user decision: no white page); `.export-doc` only paints its surface from the active tokens (`background-color`/`color`), which keeps every heading/meta/diagram text visible instead of blending into the shell.
- **Print flips to light paper**: `@media print` re-scopes the full token set once (`.export-doc` + `:root`), so text, utilities, and SVG fills print as dark-on-white under any app theme. Also in the print block: hide `.no-print` chrome (header, buttons, canvas zoom controls) and `.diagram-legend`; release the content width to the page, `break-inside: avoid` on sections/diagrams/definition rows, `break-after: avoid` on headings, `thead { display: table-header-group }`. `@page { size: A4; margin: 12mm 10mm }`, `@page export-diagram { size: A4 landscape; margin: 10mm }`, `.export-diagram { height: 174mm }` in print, plus the `[data-print-scope="diagrams"]` hiding/pagination rules for the diagrams-only mode.
- Ops note: **restart `npm run dev` after CSS-only edits** — globals.css HMR misses served stale print/light rules twice.

## Limitations (deliberate)

- **Browser print dialog, not one-click PDF.** One-click would need jsPDF/html2canvas (poor SVG fidelity) or server-side Playwright rendering — deferred until users ask.
- **Page numbers** come from the browser's print header/footer option; Chromium ignores `@page` margin-box counters.
- **Large diagrams scale to fit one page** (fit-to-page, both dimensions) — no clipping, but a 40-class LLD can get small. Rank-based pagination across pages is *not* implemented; split it if users hit it.
- Dark palette for the app itself stays dark-only (recorded decision); light exists for paper.

## Tests

- Unit: `lib/export/document.test.ts` (cover/rows/warnings/date), `lib/export/svg.test.ts` (standalone XML, inline styles preserved, live element untouched, filename slugs).
- Playwright `e2e/export.spec.ts`: full document render, back-link href, `emulateMedia("print")` chrome-hidden + **A4 PDF page-geometry check** (`preferCSSPageSize`, asserted `%PDF-`, exactly two landscape pages — one per diagram, no split — and every diagram section ≤ the 190mm landscape printable height; written to `test-results/export-smoke.pdf`), overflow sweep at 1440/1280/834/390, SVG download contents (full-resolution `viewBox`, no fitted transform), missing/invalid model cards, signed-out access card, and the `?next=` sign-in round-trip, and the **diagrams-only** print check (exactly two landscape MediaBox pages, text pages hidden, legends hidden; written to `test-results/export-diagrams-only.pdf`).
