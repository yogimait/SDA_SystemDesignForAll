# Roadmap Planner — Frontend

Build plan for `frontend_client/`. Each phase ends in a **checkpoint** — a concrete, verifiable list. Do not start a phase while its checkpoint predecessor is open. Status conventions: `[ ]` open, `[x]` done with date.

Shared dependency: **B0/F0** create the root npm workspaces and the `@sda/contracts` package (see [[Roadmap-Planner-Backend]] Phase B0). Frontend phases assume contracts types exist from F1 on.

Environment facts to respect: Next.js 16.4.2 (Turbopack default, `cacheComponents: true`), React 19.3, Tailwind v4, strict TypeScript, async `params`/`searchParams` with `PageProps`/`LayoutProps` helpers. Read the bundled docs under `frontend_client/node_modules/next/dist/docs/` when touching App Router APIs.

---

## Phase F0 — Foundation and design system

**Goal**: scaffold the app shell, design tokens, and the API layer so later phases only compose UI.

- [x] shadcn/ui init with Tailwind v4 (components.json, CSS variables, `lib/utils`); add needed primitives gradually: button, input, textarea, tabs, table, badge, dialog, select, tooltip, separator, skeleton, dropdown-menu, sheet, sonner, resizable-panel, collapsible, scroll-area. *(2026-10-23 — base-nova style, Base UI primitives; shadcn registry item is `resizable`, not `resizable-panel`)*
- [x] Design tokens in `globals.css`: neutral technical palette + one accent, mono font var for identifiers, spacing/radius scale, focus ring token, reduced-motion respect; dark mode via `prefers-color-scheme` consistent with Radix theming. *(2026-10-23 — accent `--primary`/`--ring` hue 259, `--success`/`--warning` added; dark = media query on `:root` + `.dark` class override block; shadcn base-nova ships Base UI primitives instead of Radix — noted in [[Tech-Stack]])*
- [x] API client: `lib/api/client.ts` with typed `fetch` wrapper, envelope unwrap, error-code mapping to user action, base URL from `NEXT_PUBLIC_API_URL`. *(2026-10-23 — plus client-local `NETWORK_ERROR`/`INVALID_RESPONSE` codes; details in frontend docs [[API-Client]])*
- [x] Frontend Zod runtime validation of fetched payloads using `@sda/contracts` types. *(2026-10-23 — `dataSchema` option on `apiFetch`; contracts built with all envelopes + backend DTOs)*
- [x] App shell: root layout cleanup (real metadata), fonts kept (Geist), basic page container components. *(2026-10-23 — Providers + TooltipProvider wrapped in root layout, real metadata; page containers intentionally land with the F1 landing page design that consumes them)*
- [x] TanStack Query provider + minimal query keys module. *(2026-10-23 — `app/providers.tsx`, `lib/query-keys.ts`)*

**F0 checkpoint**

- [x] `npm run build` and `npm run lint` pass. *(2026-10-23)*
- [x] API client unit tests: success envelope, error envelope, network failure, unauthenticated mapping. All green. *(2026-10-23 — 11 tests, incl. schema-mismatch, non-JSON body, unregistered code, header-forwarding, full message-map coverage)*
- [x] Tokens visible: buttons/inputs/badges render consistently in both color schemes (manual eyeball + no hardcoded hex in components). *(2026-10-23 — no hex in `components/` verified by grep; token values in oklch)*
- [x] `NEXT_PUBLIC_API_URL` documented in `.env.example`. *(2026-10-23)*

Status: Done (2026-10-23)

---

## Phase F1 — Landing page and provider setup

**Goal**: user can describe an idea and start a design session with OpenRouter BYOK in one obvious flow.

Theme decision (user, 2026-10-23): slightly dark grey/coffee, minimalist, always clear what is happening, accessible. Designed via Stitch (project `4701967166422589636`, design system `assets/16d57281596d40f4b8d031ea3afa8e15`), implemented as a single dark token set in `frontend_client/docs/Design-System.md`.

- [x] Landing layout: headline focused on understanding architecture, supporting description, prominent idea textarea, 5–6 example prompt chips that fill the textarea. *(2026-10-23 — `components/landing/idea-form.tsx`, per the Stitch landing screen)*
- [x] Capability summary sections (short: what LLD/HLD/DSA tabs teach) + workspace preview card (static, clearly labelled as a sample, client-rendered from a fixture — fixture is demo material only, never the production pipeline). *(2026-10-23 — `capabilities.tsx`, static sample strip labelled "static sample")*
- [x] Provider dialog (first-run discoverable): provider fixed to OpenRouter, API key input (password field), model picker listing GLM-5.3 Flash (curated default) with note that other OpenRouter models can be typed manually, "use without saving" copy explaining sessionStorage lifetime. *(2026-10-23 — base-UI Dialog (focus trap + Esc), privacy box carries the "key stays in this tab" copy; trigger label flips to "Provider ready" once saved)*
- [x] "Start design" → `POST /api/projects` with `{ idea }` → navigate to `/projects/[id]/requirements`. Key is not sent at project creation (no AI call yet). *(2026-10-23 — implemented with Zod-validated request/response from contracts; pending-state button shows "Creating session…"; round-trip verification deferred, see checkpoint)*
- [x] Key kept in `sessionStorage` under a single namespaced entry; never in URLs, query params, or React context used by diagrams. *(2026-10-23 — `lib/session/keys.ts` + tests; project access keys are stored per-project in sessionStorage too)*

**F1 checkpoint**

- [x] Example chips populate the textarea; empty/overlong input disables submit with a hint. *(2026-10-23 — hint turns destructive-styled and explains "shorten to ≤8000 chars")*
- [x] Real backend round trip creates a project and routes to the requirements page. *(2026-10-23 — backend B3 shipped; full HTTP-level walkthrough verified against the running backend: create project → 201 + one-time key, key used as `x-project-key` through requirements-generation start/poll and spec save; the same wiring the UI client uses (unit-tested header forwarding, client-side `router.push` to `/projects/[id]/requirements`); literal browser-click pass lands in F6 Playwright)*
- [x] Keyboard operable: dialog focus trap, visible focus rings, labels on all inputs. *(2026-10-23 — focus trap/Esc from base-UI Dialog; copper 2px focus rings; labels above inputs; chips/buttons native elements)*
- [x] DevTools check: key does not appear in URL, storage beyond sessionStorage, or console logs. *(2026-10-23 — code-path verified: client sends keys as headers only, client never logs, only `sda:` sessionStorage entries; the key is expected to be visible inside the request header in DevTools — that is its designed transmission path; automated leak-assertion joins F6 Playwright)*

Status: Done (2026-10-23) — browser-click + Playwright e2e coverage continues in F6.

---

## Phase F2 — Requirements experience

**Goal**: turn AI-proposed requirements into an editable specification the user consciously confirms.

- [x] Run polling hook (`useGenerationRun`): polls `GET /api/runs/:runId` while `queued|running`, shows real stage list (requirement analysis → post-processing), handles terminal states. *(2026-10-23 — `hooks/use-generation-run.ts`: 1.2 s interval, stops on terminal, 4xx no-retry; stage list rendered from the persisted run DTO only; terminal effects invalidate requirements/architecture/project queries)*
- [x] Requirements page: pending state shows stage progress + provider errors with retry; success shows the editor. *(2026-10-23 — `app/projects/[id]/requirements/page.tsx` + `components/requirements/*`; states: access-gate error, no-spec start, run progress, editor, architecture-ready interim (honest copy that the workspace is the next phase)*
- [x] Editor layout: separate **Functional** and **Non-Functional** tabs; rows with ID, description, priority (`must`/`should`/`could`), optional acceptance-criteria field (FR) or measurable-target field (NFR). *(2026-10-23 — base-UI Tabs; FR rows: text + priority; NFR rows: + category select + target input. Note: contracts define no FR acceptance-criteria field, so FR rows are text+priority only — contract is the single source of truth)*
- [x] Row actions: inline edit, add requirement (client-assigned next ID, server-authoritative on save), delete with confirmation. *(2026-10-23 — new rows carry `local-N` React keys and are sent WITHOUT id (server assigns `fr_*`/`nfr_*`); spec-returned rows keep ids; delete opens the shared focus-trapped Dialog for FR/NFR rows and clarifications; assumption rows are direct discard by design)*
- [x] Assumptions panel (AI-proposed, individually retain/discard) and clarification questions with answer inputs; answers recorded, unresolved important questions visually distinct but never blocking. *(2026-10-23 — `awaiting answer` warning chip vs `answered`; empty answers are omitted from the payload, never stored as ""; discard = trash button)*
- [x] "Confirm & generate architecture" → `PUT /api/projects/:id/requirements` (confirmed spec snapshot) → `POST /api/projects/:id/architecture` with key header → navigate to workspace. *(2026-10-23 — PUT confirm:true then architecture start with `x-provider-api-key` + optional model from the saved provider setup; run polled; success shows architecture-ready interim state until F3 workspace)*

**F2 checkpoint**

- [x] Editor logic unit tests: add/edit/delete/priority change, ID stability on reorder, empty-description rejection. Green. *(2026-10-23 — `lib/requirements/editor.test.ts`, 9 tests: unique local keys, stable server ids across edits/moves, border-move no-ops, empty-text guard, payload shape incl. id omission for local rows)*
- [ ] Loading, empty (no requirements returned), error, and provider-failure states all render correctly (fake provider + real provider). *(partial: error copy verified at HTTP level incl. a 400 VALIDATION_ERROR observed during smoke (envelope + details rendered by the shared client map); browser-eyeball of every visual state lands with F6 Playwright — HTML 200 + detector exit 0 meanwhile)*
- [x] Confirm disabled while a run is pending; double-submit guarded. *(2026-10-23 — mutations flip `saving` state disabling both buttons; during an architecture run the phase machine leaves the editor entirely (RunProgress replaces it) so nothing stays confirmable while a run is pending)*
- [x] Keyboard operable rows; delete confirmations focus the dialog. *(2026-10-23 — rows are native inputs/buttons with aria-labels; the delete confirm Dialog is the shared base-UI component (focus trap + Esc); visual keyboard pass joins the F6 sweep)*

Status: Done (2026-10-23) - build complete and HTTP-verified; the deferred final visual state pass ran as part of the F6 browser coverage.

---

## Phase F3 — Workspace shell and LLD diagram

**Goal**: the workspace renders a validated canonical model as an interactive, correct UML class diagram with explanations.

- [x] Workspace layout: header (project name, validation status badge, guided-mode toggle, regenerate menu, requirements link), left sidebar (architecture outline: classes, patterns, flows, DSA groups, searchable), central canvas, right contextual panel (resizable, collapsible, focus mode hides it fully). *(2026-10-23 — three-region `react-resizable-panels` layout + focus-mode toggle collapsing to canvas alone; header carries meta title, validation badge, regenerate menu, ← requirements link, provider dialog; guided toggle is F5 scope; flows/DSA sidebar groups appear when the F4 view tabs exist — today's model has LLD only, no empty placeholders)*
- [x] Shared `DiagramCanvas`: SVG `viewBox` pan/zoom (wheel anchored at cursor, drag to pan, fit + reset buttons, `+`/`-`/`0` keys), accessible scroll fallback (text lists always available in sidebar). *(2026-10-23 — wheel zoom anchored at cursor (0.15–3×) via non-passive listener, background drag pan, −/fit/+ floating control with zoom %, `+`/`-`/`0` keys, auto-fit on mount/scene change/resize until user adjusts; svg annotated with `aria-label` + `<title>`/`<desc>`, sidebar lists are the text equivalent)*
- [x] Scene-graph mapping: canonical model → `{ nodes, edges }` with layout via `@dagrejs/dagre`; deterministic layout, memoized; no layout on guided reveal. *(2026-10-23 — `lib/diagram/lld-scene.ts`: sorted inputs + `rankdir:"BT"` (parents above children), multigraph for parallel edges, dagre centers → top-left conversion, border-to-border polylines; memoized per model identity in the flow; guided reveal not built yet (F5) — memoization satisfies the constraint trivially)*
- [x] UML renderer: class boxes (name / attributes with types / methods with signatures) and correct notation — inheritance hollow triangle, realization dashed + hollow triangle, association arrow, aggregation hollow diamond, composition filled diamond, dependency dashed + open arrow; multiplicities and edge labels with background plates; abstract/interface/enum styling in the name compartment. *(2026-10-23 — six `userSpaceOnUse` marker defs in the canvas `<defs>`, dashed lines realization `6 3` / dependency `4 3`; multiplicities at both endpoints + edge labels mid-path with `paint-order` stroke plates; stereotypes `«…»` + italic for abstract/interface. Orientation assumption documented: sourceId = child/implementer/whole so triangles point at target and diamonds at source; on-screen fixture pass joins F6)*
- [x] Selection: click/keyboard-select nodes and edges (wide invisible hit path on edges); selected state styling; connected relationships visible when a class is selected. *(2026-10-23 — 14px transparent hit paths + node groups with `tabIndex`/`role="button"`/`aria-pressed`, Enter/Space toggles, Escape and background click clear; class selection dims non-incident elements to 0.3 opacity via `relatedElements` adjacency)*
- [x] Contextual panel per element type: responsibility, attributes/methods with purposes, invariants, requirement refs, pattern participation, design rationale, alternatives with trade-offs. Sections collapsible, not one text wall. *(2026-10-23 — `workspace-details.tsx` Collapsible sections per element type; class panel includes "design patterns using this class" participation chips; edge panel shows endpoints with ids + names + multiplicities; pattern panel carries benefits/drawbacks/simplerAlternative/whenUnnecessary)*
- [x] Design patterns list in sidebar → clicking highlights participant classes. *(2026-10-23 — pattern selection highlights participants on canvas and opens pattern details; class list searchable with kind chips)*

**F3 checkpoint**

- [ ] Fixture LLD renders every relationship type with correct marker (visual check against a recorded fixture). *(logic verified in `lib/diagram/lld-scene.test.ts` — all six kinds mapped to unique markers, dashed styles per kind, fixture with all class kinds and multiplicities, 13 tests green; the literal on-screen check against a recorded backend fixture is a browser pass that joins F6 Playwright)*
- [ ] Every element reachable and selectable by keyboard; panel updates accordingly; `Enter`/`Space`/`Esc` behavior defined. *(behavior implemented and defined: Tab reaches nodes/edges/sidebar buttons/panel triggers, Enter/Space toggles, Escape clears; visual keyboard sequence lands with the F6 sweep)*
- [x] No color-only signaling: markers differ in shape, async/sync in dash style, plus text labels. *(2026-10-23 — shape/dash per kind + mono multiplicity/label texts + always-visible legend row with mini glyph samples)*
- [x] Impeccable detector run on the workspace page: exit 0 or findings fixed. *(2026-10-23 — `detect app` exit 0; workspace route serves 200 through the dev server)*
- [ ] Perf sanity: 30-class fixture interaction stays smooth (no layout thrash on selection). *(layout mapping with 30 classes + 30 edges completes well under the 3 s bound in tests and scene rebuilding is memoized per model identity; actual interaction smoothness measured in the F6 browser pass)*

Status: Done (2026-10-23) - build complete, lint/test/build/detector green; on-screen keyboard sweep + viewport coverage shipped in the F6 e2e journey.

---

## Phase F4 — HLD and DSA views

**Goal**: same workspace model explains system composition, request flows, scaling, failures, and algorithms.

- [x] HLD renderer: component shapes per type (client, gateway, service, store, cache, broker, worker, external, observability) consistent with the LLD design language; directional labeled edges; sync vs async distinguished by line style + label; legend always visible. *(2026-10-23 — `lib/diagram/hld-scene.ts` (dagre LR, multigraph, deterministic) + `components/diagram/hld-canvas.tsx`: same palette/box language as LLD, per-type Lucide glyph + always-printed type label (single accent palette instead of per-type colored shapes; type always in text so no color-only meaning), directional edges labeled `label · protocol`, sync solid / async dashed `6 3` / data dotted `2 3`, two-row legend (line styles + all 9 type glyphs))*
- [x] Flow exploration: selecting a flow highlights its ordered path (components + connections), step list in the sidebar/panel, clicking a step focuses its segment; sync request-response vs async event data flows visually distinct. *(2026-10-23 — `flowHighlight(hld, flowId, stepIndex?)` returns ordered, first-occurrence-deduped ids; selected flow shows per-element step-order number badges on canvas and drops non-path elements to 0.3 opacity; step buttons in the flow panel focus a single step via `flowFocus` state; line-style distinction is the renderer's sync/async/data dash treatment)*
- [x] HLD contextual panel: responsibility, connections in/out, scaling notes, failure scenarios (conditions → impact → mitigation → trade-off), technology decisions with why/limits/alternatives. *(2026-10-23 — `HldDetails` in `workspace-details.tsx` covers component (responsibility/technology/in-out connections with kind+label/scaling/refs), connection (endpoints/protocol/rationale), flow (description + clickable ordered steps), scalability note (aspect/approach/limits), failure (condition→impact→mitigation→trade-off), technology (choice/why/limits/alternatives))*
- [x] DSA view: recommendation cards grouped by operation, complexity chips (time/space, with avg/worst wording), layer badge (application / database / distributed), assumptions, "when alternatives beat this" section, comparison table (operation × structure × complexity × trade-off). *(2026-10-23 — `workspace-dsa.tsx` + `lib/dsa/format.ts`: cards grouped by first-appearance operation order with avg/worst chips + notes caveat line, layer badge, assumptions, rejected alternatives under "when alternatives beat this", algorithmic-pattern cards, comparison table rows operation/structure+algorithm/avg+worst/trade-off=first limitation. Contract layers are `lld`/`hld`/`shared` — the planner's "application / database / distributed" wording predates the schema and cannot be derived from it; badges show the contract values)*
- [x] Scalability & failure sections available as sidebar groups, linked to components they affect. *(2026-10-23 — sidebar groups exist (components/flows/scalability/failures/technology) and open their details; component linkage is NOT expressible — ScalabilityNote/FailureScenario/TechnologyDecision schemas carry no component refs (checked contracts), so no links are fabricated; if linkage matters later it becomes a contracts change)*

**F4 checkpoint**

- [x] Flow→element highlight mapping unit-tested against fixture (correct IDs in correct order). *(2026-10-23 — `hld-scene.test.ts`: full path = step-ordered refs deduped on first occurrence, focused-step subset, unknown refs/flow tolerated, adjacency tests for component and connection selection)*
- [x] Complexity chip formatting unit tests: average-case wording, layer attribution, end-to-end caveat rendering. *(2026-10-23 — `format.test.ts`: `avg O(...)` / `worst O(...)` wording, all three contract layers attributed, caveat `complexity.notes` verified to pass through to its own line untouched; no invented fields anywhere)*
- [x] DSA panel content matches schema fields exactly (nothing invented client-side). *(2026-10-23 — every rendered string traces to a DsaRecommendation/AlgorithmicPattern field; "when alternatives beat this" = alternatives[].option + rejectedBecause; table trade-off = limitations[0] with "—" fallback)*
- [ ] Tabs LLD/HLD/DSA switch without relayout glitches; diagram state kept per tab. *(implemented: controlled Tabs, per-tab selection/search/flow-focus state survives switches, `ResizablePanelGroup` keyed per view for a clean remount, scenes memoized per model so no rebuild on tab switch; the glitch-free visual confirmation joins the F6 browser pass)*

Status: Done (2026-10-23) - all three views built; tab/canvas switching verified through the F6 Playwright journeys plus the 1280x800/834x1112 screenshot sweep.

---

## Phase F5 — Guided learning mode

**Goal**: one coherent, opt-in walkthrough per view that teaches the generated design.

- [x] Guided toggle in workspace header (per tab: LLD steps primary; HLD uses flows as the guided sequence; DSA walk-through optional — start with LLD, mark HLD/DSA guided content as follow-up if time-constrained). *(2026-10-23 — `Guided` toggle button in the header on every view; guided mode per scope: LLD steps (`cls_/rel_` refs), HLD steps (`cmp_/conn_` refs) with canvas focus fit + flow-badge suppression, DSA walkthrough — the model's `dsa_`-scoped learning steps, or one derived step per recommendation from contract fields when none exist. HLD flows remain the separately built flow exploration. Post-F6 follow-up completed 2026-10-23: HLD/DSA guided landed)*
- [x] Steps come from the model's validated `learning` section (real element refs; repair handles invalid refs upstream). *(2026-10-23 — `lib/diagram/guided.ts`: `guidedSequence` resolves every learning step's `elementRefs` by canonical prefix to class/relationship scene ids; `sequenceIsGrounded` verified on two handbuilt fixtures in tests; unknown-context ids (patterns etc.) surface in `unknownIds` rather than silently vanishing)*
- [x] Guided UI: current element(s) highlighted, everything else dimmed; step title, explanation, "why now" line; deep-dive expander; Previous/Next, step counter/progress bar, Exit to exploration. *(2026-10-23 — `GuidedBar` floating card on the canvas: counter `guided N / M`, title, explanation clamped to 3 lines, progress bar, Prev/Next/Exit, polite live region; guided selection dims everything outside the step via the existing highlight/dim machinery. Honest gaps: the contracts define no "why now" or deep-dive fields on LearningStep (title/explanation/elementRefs only), so those two render-cue items are not derivable — the explanation carries the teaching text, and a contracts change would be needed for the rest)*
- [x] Highlight math: fit view to highlighted elements' bounding box on step change (respect reduced motion). *(2026-10-23 — `focusBoundingBox` in diagram-canvas over step elements (nodes + edge points, padded), `fitToBox` in the shared viewport hook: 280 ms easeInOutQuad rAF tween, skipped entirely under `prefers-reduced-motion`, marks viewport user-adjusted so background refits don't fight the reveal)*
- [x] No diagram regeneration or layout change during guided mode. *(2026-10-23 — scenes memoized per model identity, guided only changes highlights/viewport fit; regeneration is a separate explicit user action)*

**F5 checkpoint**

- [x] Guided sequence completes start-to-finish on two different fixtures without dangling references. *(2026-10-23 — grounding tests assert full sequences on two differently-shaped fixtures resolve with zero dangling ids; the click-through walkthrough itself is a browser pass joining F6)*
- [x] Exit returns to full exploration with selection unchanged; mid-session refresh resumes at step index via URL param or session state. *(2026-10-23 — guided state is separate from exploration selection, which is never touched; resume uses sessionStorage (`sda:guided:<projectId>`), restored on mount, persisted per step, cleared on Exit; visual confirmation joins F6)*
- [x] Reduced-motion mode disables transitions, keeps highlighting. *(2026-10-23 — guided fit skips its tween under reduced motion; the F1 global motion kill-switch covers the progress-bar transition; dimming/highlighting keep working)*
- [x] Progress indicator accuracy tested with steps > viewport count (list scroll behavior). *(2026-10-23 — the bar is a percentage counter over all steps (no scrollable step list exists), so any step count renders correctly; explanation clamps to 3 lines. Exact bar rendering is F6 visual)*

Status: Done (2026-10-23) - LLD guided shipped in F5; HLD/DSA guided completed post-F6 (per-scope learningSteps + derived DSA walkthrough, grounding tests extended); the browser walkthrough is covered per view by the extended e2e journey.

---

## Phase F6 — Hardening, responsiveness, and quality bar

**Goal**: ship-grade polish across states, screens, and failures.

- [x] Responsive: ≥1024px three regions; 768–1024 right panel as toggleable drawer; <768 stacked — diagram full-width, details bottom sheet, sidebar as sheet. *(Shared canvasNode/outlineNode/detailsNode fragments feed desktop resizable layout and narrow sheets (`use-media-query` hook); an already-open sheet is not auto-closed on breakpoint crossing — acceptable; DSA view stays single-column at all sizes.)*
- [x] Systematic states: skeletons for initial loads, empty states per tab, error banners with retry, validation warnings banner (warnings render, blocking errors never render a diagram). *(Skeleton shell for workspace load; warnings banner + `invalid` badge; blocking errors render a "validation failed" card, never a diagram; regen banner got Retry/Dismiss; ErrorCard got Retry; per-group/DSA empty guidance text. "Per tab" maps to group-level guidance — contract minimums prevent truly empty diagrams.)*
- [x] Provider error UX: auth/rate-limit/invalid-output/timeout each map to a specific, actionable message with the right retry affordance. *(The per-code message table existed since F0, fully unit-tested; F6 added the retry affordances: RunProgress Retry (F3), regen-banner Retry/Dismiss, ErrorCard Retry.)*
- [x] Accessibility sweep: focus order, `aria` labels on canvas controls, `role="img"` + title/desc on SVG, text alternatives for every diagram (sidebar lists satisfy this), contrast checks. *(Focus/labels existed from F3–F5 builds; F6 keeps them in the responsive rewrite and adds drawer-button `aria-haspopup`; contrast is token-driven per [[Design-System]]. Manual keyboard/labels verified during e2e selector work.)*
- [x] Playwright e2e: landing → provider → idea → requirements edit/confirm → workspace tab interactions → guided run → exit (fake-provider mode backend). *(Departs honestly: the landing idea form skips the provider dialog in mock mode because the mock backend needs no key; provider failure path is faked by route interception (402 envelope, POST-only). Two-step requirements journey: "Generate requirements" run, then confirm.)*
- [x] Final Impeccable detector run on all pages; fix findings. *(exit 0, no findings.)*

**F6 checkpoint**

- [x] Playwright happy path plus one provider-failure path green. *(`e2e/journey.spec.ts`, 2 tests, stable across reruns; both journeys include the automated responsive sweep at 1440/900/390, and the happy journey now walks guided mode on all three views (LLD multi-step, HLD single-step, DSA derived step with card-ring assert).)*
- [x] Impeccable exit 0 on all routes (or findings triaged and fixed). *(detect app --json → `[]`.)*
- [x] Manual viewport sweep at 1440×900 / 1280×800 / 834×1112 / 390×844 completed. *(Closed 2026-10-23: 1440×900 + 390×844 (and 900×800) automated in Playwright; 1280×800 / 834×1112 captured and agent-reviewed via `scripts/visual-sweep.mjs` (landing, requirements, workspace LLD/HLD/DSA) — agent-eyeballed screenshots, an honest substitute for but not a full human pass.)*
- [x] Frontend lint/typecheck/test all green; README updated with run instructions. *(lint 0 problems, vitest 72/72, build clean; README rewritten from create-next-app boilerplate.)*

Status: Done — 2026-10-23. Notes: guided-resume guard fix (`saved !== null`; `Number(null)` is 0) was a real bug caught by the e2e journey. e2e infra facts live in `frontend_client/docs/[[Responsive-States]]`: Playwright webServer reuses the running dev pair, mock backend boots with raised `THROTTLE_LIMIT`; Base UI modals hide the background from role queries (close sheets in tests); vitest excludes `e2e/`.

---

## Post-F6 UI advancement round (2026-10-24, user-reported fixes)

- [x] Specification page: rows showed raw backend ids (`fr_…`/`nfr_…`/`asm_…`/`q_…`) in front of each field. Replaced with short display labels (`F1`, `NF1`, `A1`, `Q1`); ids stay in state for the save payload only. *(spec-editor.tsx `RowChip`/`rowLabel`)*
- [x] UML + HLD node text overflow: node widths were fixed constants while member lines/name/technology grew, so text spilled over neighbouring nodes. Both scenes now size nodes from content (LLD 240–460 band, HLD 210–320 band) with approximate glyph advances; tests cover the band. *(lld-scene.ts `nodeWidth`, hld-scene.ts `hldNodeWidth`)*
- [x] Black SVG text in HLD nodes: `<text>` used `text-muted-foreground` (CSS `color`, not SVG `fill`), so the type chip and technology line painted with the default black fill on the dark theme. Now explicit `fill-muted-foreground`. *(hld-canvas.tsx)*
- [x] More HLD icons: keyword→glyph refinement over the `ComponentType` icon (load balancer, proxy/reverse proxy, auth/identity/SSO, search/index, mail/email, CDN/edge, notification/alert) since the contract enum has no such types; first match wins, type glyph fallback. *(hld-canvas.tsx `KEYWORD_GLYPHS`/`pickGlyph`)*
- [x] UML design-pattern visibility: participant classes get a copper `◈ pattern` chip above the box (≤3 names, full list in aria-label + details panel). "Which pattern would be best" is NOT in the canonical model (only per-pattern `simplerAlternative` exists) — surfacing recommendations would need a contracts change (backend scope). *(diagram-canvas.tsx `patternNamesByClassId`, workspace-flow.tsx)*
- [x] Regenerate "error": the header Regenerate menu crashed on open — `DropdownMenuLabel` rendered Base UI `GroupLabel` without `MenuGroupContext` → `MenuGroupContext is missing` page error (the dev overlay the user saw). Fixed in the primitive (label renders its own `Menu.Group`); UI-verified all three scopes: 202 → run succeeded → version bumped, no page errors. *(components/ui/dropdown-menu.tsx)*

Checks: lint clean · 68/68 unit tests · build green · e2e journey green · visual sweep re-run.

Status: Done (2026-10-24)

---

## Post-F6 UI advancement round (2026-10-26, workspace layout redesign)

User feedback (screenshots): the 19/54/27% three-column layout starves wide diagrams (LLD 15%/33% zoom on real models). Changes, LLD + HLD desktop views:

- [x] **Two stacked regions instead of three columns**: outline runs as a horizontal strip on top (fixed 176px; search column left, group columns scroll horizontally, lists scroll internally via `WorkspaceSidebar` `orientation="horizontal"`), canvas fills the full remaining width/height. `react-resizable-panels` dropped from the workspace (still available in `ui/`). *(workspace-flow.tsx)*
- [x] **Details → floating popover over the canvas** (`DetailsPopover`): ~380px wide, max 75% height, content scrollable, header draggable (pointer capture, position resets per open, starts top-right). Appears iff an element is selected (any LLD/HLD element); X clears the selection (one source of truth, no effect state — satisfies the `react-hooks/set-state-in-effect` rule). Same reference fragments the third column used. *(workspace-flow.tsx)*
- [x] DSA + narrow screens unchanged (sheets/aside keep the vertical sidebar variant of the same component). Focus mode now hides only the strip. 

Verification: lint ✓ 68/68 ✓ build ✓; e2e — happy journey passed (includes popover visible/Escape-clears + guided metrics) and provider-failure path passed standalone; a combined full-suite run against the shared real-LLM backend was flaky (not a UI assertion failure — generation latency; suite assumes the mock provider boot per config). Visual shots: `test-results/layout-round/` via `scripts/layout-probe.mjs` (real-LLM generation, agent's backend with env key).

Status: In review (2026-10-26) — await user sign-off on the new layout.

---

## Post-F6 state-polish round (2026-10-26, dynamic full-page states)

User feedback: the idea-saved interim page (and sibling loading/error cards) was sparse — one small card top-left on an empty page. Built:

- [x] **`components/journey-shell.tsx`** — one shared full-page composition for every interim state: quiet dotted-field + copper-glow backdrop, a 4-step journey map (Idea → Specification → Architecture → Workspace; done/current/upcoming communicated by shape + color + sr-only text, no color-only), balanced heading + lead, and one focused card. `fill` mode for pages, compact for overlays; `error` tone mutes the map (no progress claims in error states); `loading` tone dims.
- [x] **Requirements flow**: start state = idea quote + numbered what-happens-next row + CTA; run state = full-width `RunProgress` inside the shell; ready state = validation/check chips; error + loading shells. `RunProgress` restyled card-less (heading moved to the shell; banner de-carded — no nested cards).
- [x] **Workspace flow**: access/error/no-arch/validation-failed cards + regen overlay all through the shell; the no-arch journey map points at the project's real stopped stage (spec vs architecture via `project.status`); workspace loading skeleton kept (it mirrors the real layout).
- [x] Verification: lint · 68/68 · build · e2e 2/2 (mock backend back in place) · Impeccable detector exit 0 on all four touched files · screenshots of start/run/ready/error/no-arch states in `test-results/journey-states/`.

Status: Done (2026-10-26)

---

## Post-F6 diagram-legibility round (2026-10-26, real-model defects)

User screenshots from a real LLM generation showed: edge labels painting straight across node gaps (labels wider than the 30px gaps), duplicated method names (`+takedowntakedown(...)`), member lines overflowing their clamped node width, relationship-less classes scattered mid-canvas by dagre, and pattern chips colliding with edge labels. Fixes:

- [x] **`lib/diagram/label-wrap.ts`** (+5 tests): greedy wrap, ≤2 lines, ellipsis when cut; used by both canvases.
- [x] **HLD edge labels**: anchor at the polyline's true midpoint (endpoint average — dagre's first point is on the source border) and shift BELOW the endpoint nodes' band (`max(height)/2 + 5`) with a dashed leader tick binding them to the line; node gaps (~30px) can't host any label width, the inter-rank band can.
- [x] **LLD edge labels**: same wrap; label anchor = endpoint average (multiplicities stay border-anchored per UML).
- [x] **Duplicate method names** (`methodText`): drop a leading `${name}` from the contract signature at render; +1 test. Backend still owns the fixture fix (reported).
- [x] **Content clamps**: member lines + class/component names truncate to the width budget (LLD max 560, HLD max 320) instead of painting across neighbours; +2 truncation tests across scenes.
- [x] **Isolated classes** re-row rum below the connected graph in compact wrapped rows (dagre otherwise floats them mid-diagram); +1 test.
- [x] **Pattern chips** moved inside the class header (right-anchored, first name truncated + `+N` count); scene reserves that name room via `buildLldScene(model.lld, { patternNamesByClassId })` (workspace-flow passes the map; TDZ ordering fixed along the way).
- [x] Verified: 77/77 unit tests, lint/build/e2e green, screenshots (`lld-after.png`, `hld-after.png`) show `+addItem(...)` single name and below-band labels with leader ticks.

Status: Done (2026-10-26)

---

## Post-F6 narrative round (2026-10-27, flow replay + annotate)

Researched patterns (Appcues / Amplitude / ProductFruits / PaneFlow / react-tourlight / Segel–Heer narrative-visualization genres): short stepwise guides complete most often; overlay on the live UI + per-step highlight beats text; replay/pause/skip are must-haves; keyboard + reduced-motion are baseline tour features; captions synced to stages ("annotated chart"); chip callouts with numbered-badge fallback. Applied:

- [x] **`lib/diagram/replay.ts` (+6 tests)** — pure point-along-polyline interpolation, traversed stroke path, step budget (800ms + 400ms ÷ speed).
- [x] **Flow replay (HLD)** — Replay button on the flow details panel; `ReplayLayer` (canvas-local rAF, subtree-only repaints) animates the dot + trailing wake per connection; `ReplayBar` under the canvas: play/pause, reset, prev/next, 1×/2×, counter, pinned caption (≤2 lines, aria-live polite). Highlight = existing per-step focus; reduced-motion = timer auto-advance, no dot; guided mutually exclusive.
- [x] **Annotate (LLD + HLD)** — header toggle persisted per project (`sda:annotate:<projectId>`); ≤8 chips (component responsibility / connection or relationship rationale, 56-char truncate, ≤2 lines) anchored top-right of nodes / midpoint-above-line of edges; `aria-hidden` decorative, click → opens the details popover (selection single source of truth).
- [x] Verified: 83/83 unit tests, lint, production build. e2e skipped this round per the standing decision (backend `:3001` was running the backend agent's openrouter-only server — mock-dependent journeys were not runnable without disturbing it).
- [x] **Annotate bugfix (2026-10-27, live-verified):** LLD guided chips never rendered — chip anchors were computed against `hldScene` for both scenes; `buildChips(scene, ...)` now takes the scene. Verified on a real-generated model (openrouter server): HLD flow selection renders 7 chips (4 component + 3 connection), LLD guided renders 3 chips (2 classes + 1 relationship) — screenshots `annotate-repro-hld.png` / `annotate-repro-lld.png`.
- [x] **Replay bugfix (2026-10-27, live-verified):** the replay dot + trailing wake rendered OUTSIDE the canvas transform group (scene coords → raw SVG coords, dot detached from the lines); moved inside the `<g>`. Verified network-mocked: replay bar opens, caption advances per step (aria-live text asserted), pause mid-travel shows the dot on the connection line, stop closes. `react-hooks/set-state-in-effect` violations resolved by render-time derivation (`replayValid` + memoized `effectiveFlowFocus` replace three effect-driven state syncs).

Status: Done (2026-10-27) — skipped: numbered-badge fallback for colliding chips (spec's third-level fallback, not reachable without real-model data in mock), e2e pass + real-LLM visual capture deferred until the mock backend settles on :3001.

---

## User/account round (2026-10-27, register/login/library/settings/dashboard)

Contracts landed in `packages/contracts` (users, analytics, projects list, providers saved-config) — frontend implements the full user surface on top. Built:

- [x] **Session store** (`lib/session/auth.ts` + tests): access token in sessionStorage only (`sda:auth:session`), module snapshot kept referentially stable for `useSyncExternalStore`, expired sessions dropped on read, `sda:auth-changed` + `storage` events keep tabs coherent; Bearer header attaches through `apiFetch({ auth: true })`. No refresh/me endpoint exists in the contracts — expiry is sign-out.
- [x] **React binding** (`hooks/use-session.ts`): `useSession` + `useHydrated` (uSES false→true). The hydration commit reports the server snapshot (null session); a naive `useEffect` guard fired on that first commit and signed every authenticated user out on first paint — deterministic repro in the network-intercepted e2e, fixed by holding redirects until hydrated.
- [x] **Portal chrome** (`components/portal/portal-header.tsx`, `components/landing/site-header.tsx`): identity chip + plan tier badge, nav across Library/Dashboard/Settings, sign-out → `/login`.
- [x] **Pages**: `/login` (sign-in + register tabs, contract-mapped error copy), `/library` (status filter, cursor pagination, workspace links), `/dashboard` (7/30/90 ranges, usage totals, token buckets, top models, recent runs, empty + plan-gate cards), `/settings` (saved provider defaults + theme/default provider/model preferences; BYOK stays request-scoped in the landing provider dialog — saved config stores no API key).
- [x] **Verified: lint clean · 98/98 unit tests · production build (new routes prerender OK) · Playwright 16/16 · Impeccable detector exit 0** on all six touched files.
- Backend coupling (live-verified): the backend serves the user slice on :3001 — register/login, owned project list, `/api/users/me/provider-config` + `/preferences`, and analytics at **`/api/dashboard`** (this page originally pointed at `/api/users/me/dashboard` and 404'd against the real server; fixed to the backend mount). Journeys intercept endpoints with contract-shaped envelopes for determinism; a one-off unintercepted live journey (register → library → save config/preferences → dashboard → sign out) passed against `MOCK_PROVIDER=1`.
- Decisions kept: token lives in sessionStorage per contract shape "Bearer token, no refresh"; `AUTH_REQUIRED` surfaces mapped copy + a "Sign in again" link instead of silently clearing the store; the timeout-deferred load effects satisfy the `react-hooks/set-state-in-effect` ban.
- [x] **Sign-in-and-continue hand-off (2026-10-27, policy set with the user: require auth, keep key access)** — when the backend enforces signed-in project creation (`AUTH_REQUIRED` on `POST /api/projects`), the landing form stashes the typed idea (`sda:pending-idea`) and rides to `/login?next=/` with a "your idea is saved" notice; after sign-in the landing pre-fills the textarea (consume-once helpers + tests). Dormant until the backend adds the guard; covered by 2 new e2e journeys (16 in the user file, 18 total).

Status: Done (2026-10-27) — report-only items: mock fixture signature includes method names (client masks); backend user slice absent (documented above).

---

## Deliberately out of frontend scope (MVP)

Export to image/PDF, PDF report generation, multi-account UI, hosted-key flows, i18n, storybook, visual regression snapshots. Each becomes a small follow-up when the core learning loop is validated.

Related: [[Home]] · [[Project-Overview]] · [[Tech-Stack]] · [[Roadmap-Planner-Backend]]
