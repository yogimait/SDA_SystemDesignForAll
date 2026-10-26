# Workspace — exploration views

The exploration workspace for a persisted architecture.
Route `app/projects/[id]/workspace/` (PPR shell + client `WorkspaceFlow`),
built on the canonical `ArchitectureModel` from `@sda/contracts` only.

- `components/workspace/workspace-flow.tsx` — access gate, project +\n  architecture queries, header (validation badge, regenerate menu, focus\n  mode, provider dialog), view tabs, resizable layout, regeneration overlay.
- `components/workspace/workspace-sidebar.tsx` — shared outline sidebar\n  (search + named groups, used by the LLD and HLD views).
- `components/workspace/workspace-details.tsx` — per-element reference panels:\n  `WorkspaceDetails` (LLD class/relationship/pattern) and `HldDetails`\n  (component/connection/flow/scalability/failure/technology).
- `components/workspace/workspace-dsa.tsx` — DSA recommendation cards,\n  algorithmic patterns, comparison table.
- `components/diagram/diagram-canvas.tsx` — LLD SVG canvas: pan/zoom,\n  selection, highlights, marker defs, shape legend.
- `components/diagram/hld-canvas.tsx` — HLD SVG canvas (F4): component\n  boxes with type glyphs, sync/async/data line styles, flow step-order\n  badges, legend.
- `hooks/use-diagram-viewport.ts` — shared pan/zoom machinery (wheel-anchored\n  zoom, drag pan, fit, `+`/`-`/`0` keys) used by both canvases.
- `lib/diagram/lld-scene.ts` — pure LLD scene mapping (`model.lld` →\n  positioned nodes + routed edges via `@dagrejs/dagre`) + selection adjacency.
- `lib/diagram/hld-scene.ts` — pure HLD scene mapping + `flowHighlight` +\n  `hldAdjacency` (F4).
- `lib/dsa/format.ts` — DSA card/table formatting, nothing invented
  client-side (F4).

## Layout and state

Three view tabs (controlled `Tabs`): **LLD** diagram, **HLD** system view,
**DSA** cards. Selection, search, and flow-focus state are kept per tab, so
switching tabs preserves exploration state; scenes are memoized per model
identity, so no rebuild happens on tab switches.

Desktop (≥1024) LLD/HLD layout since the 2026-10-26 UX round: **two stacked
regions** — the outline runs as a horizontal strip across the top
(`WorkspaceSidebar` `orientation="horizontal"`: search column on the left,
group columns scroll horizontally, each list scrolls internally) and the
diagram canvas fills the rest. There are no resizable columns: the canvas
gets the full width, which suits the large diagrams.

Details panel: a **floating popover over the canvas** (`DetailsPopover` in
`workspace-flow.tsx`) instead of a third column. It appears when a class,
relationship, pattern, component, connection, flow, note, or decision is
selected and disappears when the selection clears — closing it (X) clears
the selection, so there is one source of truth. Normal size (~380px wide,
max 75% height), content scrolls, body fixed, header draggable via pointer
capture; starts anchored top-right, position resets each time it opens.
Focus mode still hides just the outline strip.

Narrow screens (below 1024) keep the previous behaviour — outline inline
(768–1023) or in a Sheet (<768), details in a Sheet — same render fragments,
vertical sidebar variant. DSA keeps its single scrollable column.

States handled: missing access key → back-to-landing card; project/arch
query failure → error card with the registry message (`PROJECT_NOT_FOUND`,
`PROJECT_ACCESS_DENIED`, …); `version: null` → "no architecture yet" card
linking the requirements editor; else the three-region workspace. Since the
2026-10-26 polish round these cards render through the shared
`JourneyShell` (full-page dotted backdrop + journey map with honest
per-status position; error tone mutes the map) and the regeneration
overlay reuses the same shell around the card-less `RunProgress`. See
[[Responsive-States]] for the breakpoint layout that shares these fragments.

Header badge: `validated` (success) or `validated · N warnings` (warning).
Persisted versions are always valid — the backend persists only validated
models — so no invalid-model state exists here.

## Scene mapping

`buildLldScene(modelLld)` is deterministic: classes and relationships are
sorted by id, dagre lays out with `rankdir: "BT"` (parents above children so
inheritance/realization triangles point up), `nodesep 36`, `ranksep 70`,
multigraph so two edges between the same pair are preserved. Dagre reports
node centers; the scene converts to top-left. Edge geometry reuses dagre's
border-to-border polylines. Node height = 40 header + 18/member + 2×10
padding; node width is content-aware per class — the longest member line
(≈6.3 px/char mono) and the name (≈7.2 px/char semibold) fit on one line,
clamped to the 240–460 band — so long signatures stay inside the box instead
of spilling over neighbours.

Rendering rules (no color-only signaling — shape + dash + text, legend row
always visible below the canvas):

| Kind | Marker | Line |
| --- | --- | --- |
| inheritance | hollow triangle at end (parent) | solid |
| realization | hollow triangle at end | dashed `6 3` |
| association | open arrow at end | solid |
| aggregation | hollow diamond at start (whole) | solid |
| composition | filled diamond at start (whole) | solid |
| dependency | open arrow at end | dashed `4 3` |

Assumed orientation for inheritance/realization: `sourceId` = child/implementer,
`targetId` = parent/interface; diamonds sit at the source (whole) end.
Visual verification against recorded fixtures joins the F6 browser pass.

Class boxes: stereotype line (`«interface»`, `«enumeration»`, `«value
object»`, `«abstract»`) + name (italic for abstract/interface) / UML glyph
member lines (`+`/`-`/`#`/`~`, `static` keyword, full method signature
strings from the contract) / dashed separator between attributes and
methods. Classes that participate in design patterns get a small copper
pattern chip above the box (up to three names, `◈`-prefixed; the full list
is in the aria-label and the details panel). Multiplicity labels render at
both edge endpoints and edge labels mid-way, all with `paint-order: stroke`
background plates.

## Selection and panels

Selection is one shared state `{ type: "class" | "relationship" | "pattern",
id } | null`: sidebar buttons, canvas nodes/edges (click or Enter/Space,
toggle), pattern entries. `Escape` clears; clicking empty canvas clears.

- Class selected → incident edges + endpoint classes highlight (others dim
  to 0.3 opacity); details show responsibility, all attributes/methods with
  purposes, invariants, rationale, alternatives-with-rejectedBecause,
  design patterns using the class, requirement-ref chips (`fr_*`/`nfr_*`).
- Pattern selected → participant classes highlight; details show category,
  participants, rationale, benefits, drawbacks, simplerAlternative,
  whenUnnecessary, requirement refs.
- Edge selected → details show endpoints with multiplicities (ids + names),
  label, rationale.

Pan/zoom: wheel anchored at cursor (0.15×–3×), drag on the background,
`+`/`-`/`0` keys, floating −/fit/+/zoom% control, auto-fit on mount, scene
change and container resize until the user adjusts manually. The SVG is
labeled (`aria-label` + title/desc); the sidebar lists are the text
equivalent of the diagram.

## HLD view (F4)

`buildHldScene(model.hld)`: components laid out with dagre `rankdir:"LR"`
(flow left-to-right), `nodesep 30`, `ranksep 92`, multigraph so parallel
connections between the same pair survive; deterministic like the LLD
mapping.

Boxes: rounded card in the same palette as the LLD, with a Lucide glyph +
always-printed type label (client/gateway/service/store/cache/broker/worker/
external/observability), the component name, and the `technology` string as
a mono line when present. Node width is content-aware per component (name at
≈7.2 px/char, technology at ≈6.1 px/char, clamped to the 210–320 band). The
glyph is refined by role keywords in `name`/`technology` — load balancer,
proxy/reverse proxy, auth/identity/SSO, search/index, mail/email, CDN/edge,
notification/alert — because the canonical `ComponentType` enum has no such
variants; the first keyword match wins and the type glyph is the fallback.
Connections are directional and labeled
`label · protocol`; line style encodes the kind — sync solid, async dashed
`6 3`, data dotted `2 3` — repeated in text on every label and in the
always-visible two-row legend (line styles + all nine type glyphs). SVG text
nodes always set an explicit `fill-*` class: the default SVG fill is black,
and a `text-*` color class alone paints text black on the dark theme.

Flow exploration: selecting a flow in the sidebar highlights its ordered
path — `flowHighlight` collects every step's `elementRefs` in step order
(deduped on first occurrence; unknown ref shapes tolerated) — dims non-path
elements, and renders step-order number badges on path elements. Clicking a
step in the flow panel focuses only that step's segment.

Panel contents per selection: component (responsibility, technology,
in/out connections with kind + label, scaling notes, refs), connection
(endpoints, protocol, rationale), flow (description + clickable ordered
steps), scalability note (aspect/approach/limits), failure scenario
(condition → impact → mitigation → trade-off), technology decision
(choice/why/limits/alternatives).

Sidebar groups: components, flows, scalability notes, failure scenarios,
technology decisions. Honest limitation: the contract schemas carry no
component refs on scalability/failure/technology records, so "linked to
components they affect" is not expressible; groups open their own detail
instead of fabricating links (a contracts change would be needed first).

## DSA view (F4, bento 2026-10-26)

No canvas — a responsive bento grid in `workspace-dsa.tsx` (2 columns on
md, 3 on xl, dense flow), so real models fit without long scrolling rows:

- One **tile per recommendation** — the operation is the tile's own mono
  header line (per-operation grouping became per-tile labeling). The layer
  badge, `avg`/`worst` complexity chips plus the `complexity.notes` caveat
  line, rationale, assumptions, rejected alternatives under "when
  alternatives beat this", limitations, and requirement refs are unchanged.
  Tiles carrying ≥3 extra sections (assumptions + alternatives +
  limitations) take a two-column slot on xl — content-driven bento rhythm.
- Algorithmic-pattern tiles (name, problem, approach, trade-offs).
- The **comparison table** always spans the full row (operation ×
  structure+algorithm × average/worst complexity × trade-off — first
  limitation, "—" when none).

Every rendered string traces to a contract field; `lib/dsa/format.ts` and
its tests guard the wording.



## Guided learning (per view; LLD scope in F5, HLD/DSA post-F6)

Header `Guided` toggle — shown on every tab, disabled when that view's
sequence is empty. Steps come from the model's validated `learningSteps`;
`lib/diagram/guided.ts` classifies each step's `elementRefs` by id prefix
(`guidedStepFocus`: `cls_`/`rel_` → LLD, `cmp_`/`conn_` → HLD, `dsa_` → DSA)
and `guidedStepsInScope(scope)` filters the model order down to the steps a
view can highlight (typed per scope via the `GuidedStepsFor` conditional type).
`sequenceIsGrounded(sequence, candidateIds)` proves no dangling references
(tested on two fixtures). A floating `GuidedBar` on the active view shows
counter, title, clamped explanation, progress bar, and Prev/Next/Exit; the
current step's elements highlight while everything else dims to 0.3 opacity:

- **LLD**: highlight classes + relationships; canvas fits
  `focusBoundingBox` → viewport `fitToBox` (tweened, skipped under reduced
  motion).
- **HLD**: highlight components + connections, fit via `hldFocusBoundingBox`
  (scenes + tests in `hld-scene.ts`); guided highlights override flow-paced
  exploration and the flow `stepOrder` badges are suppressed while guided.
- **DSA**: walkthrough — the model's `dsa_`-scoped learning steps, or (when
  none exist) one derived step per recommendation from contract fields only
  (`dsaGuidedSteps`: title = `rec.operation`, explanation = `rec.rationale`,
  ids = `[rec.id]`; presentation-layer derivation, no invented content).
  Matching cards get a ring (`data-rec-id`), others dim, and the first
  matching card scrolls into view.

Cursors are per view in sessionStorage: `sda:guided:<projectId>` (LLD —
kept its pre-per-view name so in-flight sessions resume unchanged),
`sda:guided:hld:<projectId>`, `sda:guided:dsa:<projectId>`. A refresh
resumes guided mode at each saved cursor and reopens the last view that had
one; only a stored cursor enables resume — a plain load never auto-starts
guided mode. Selection and search state survive; Exit clears the active
view's key only. Guided mode changes only highlights, viewport fit, and card
emphasis — never layout or the scene.

Contracts-honest gaps: LearningStep defines title/explanation/elementRefs
only — no "why now" line or deep-dive payload, so those cues would need a
contracts change. HLD flows remain the separately built ordered walkthrough
(flow selection + step focus alongside guided mode).

## Validation and error surfaces (F6)

`ValidationBadge` in the header shows three states: `invalid` (destructive,
when blocking errors exist), `validated · N warnings` (amber), clean (green).
Non-blocking warnings render an amber banner under the header (count + first
message). Blocking errors never render a diagram: the main content is
replaced by a "validation failed" card (first error + link to the
requirements editor). Query failures render `ErrorCard` with Retry
(refetches project + architecture); regeneration failures render a red
banner with Retry (restarts the scoped run) and Dismiss. Initial load shows
an `aria-busy` skeleton shell. See [[Responsive-States]] for the breakpoint
layout that shares these fragments.

## Regeneration

Header Regenerate menu → `POST /api/projects/:id/architecture/regenerate`
with `{ scope: "lld" | "hld" | "dsa" }` (+ saved model + `x-provider-api-key`
from the provider dialog). The run is polled with the shared
`useGenerationRun` hook in an overlay; success invalidates architecture/
project queries and closes (fresh scene); failure keeps the run card open
with Retry and Close. Guided mode arrives with F5 (no layout work happens
on its reveal — the scene is memoized per model identity).

## Tests

`lib/diagram/lld-scene.test.ts` (14 tests): marker map completeness for all
six relationship kinds, stereotype coverage for all five class kinds, UML
glyph rendering, deterministic layout, geometry formulas, content-aware node
widths (long member lines widen inside the 240–460 band, short classes stay
at 240), edge routing with labels/multiplicities, selection adjacency,
unknown-id tolerance, and a 30-class perf sanity bound.

`lib/diagram/hld-scene.test.ts` (13 tests, F4 + post-F6): marker/dash map
completeness for all three connection kinds, deterministic layout with
geometry formulas (technology-line height; content-aware node widths inside
the 210–320 band), edge routing with labels/protocols and parallel edges
preserved, flow→element highlight mapping in step order with
first-occurrence dedup + single-step focus + unknown tolerance,
component/connection adjacency, and the guided-step focus box
(`hldFocusBoundingBox`, padding-bounded, null when nothing matches).

`lib/dsa/format.test.ts` (7 tests, F4): chip wording, layer attribution,
caveat passthrough, trade-off fallback, operation grouping.

`lib/diagram/guided.test.ts` (10 tests, F5 + post-F6 per-scope rewrite):
full ref classification across scopes, scope filtering in model order, the
DSA derived-walkthrough fallback (model steps present / absent / empty),
sequence resolution, and grounding checks with and without dangling refs on
two differently-shaped fixtures.

Workspace-wide total 68 tests across seven files (api client, requirements
editor, guided mapping, LLD scene, HLD scene, DSA format, session keys).
Visual-only verification (real markers, tab switching, interaction
smoothness, guided walkthrough) is covered by the Playwright journeys plus
the 1280×800 / 834×1112 screenshot sweep (`scripts/visual-sweep.mjs`).

UI-primitive note: `DropdownMenuLabel` wraps Base UI's `GroupLabel` in its
own `Menu.Group` — a bare `GroupLabel` outside a group throws
`MenuGroupContext is missing` the moment the menu opens (this is what
crashed the header Regenerate menu; the menu never appeared and the error
surfaced as the dev-overlay/page error).

Related: [[Home]] · [[Requirements-Flow]] · [[Design-System]]
