# Requirements Flow

The pending state machine that turns a generated requirements spec into a
confirmed snapshot. Lives under `app/projects/[id]/requirements/`.

- `components/requirements/requirements-flow.tsx` — controller client component.
- `components/requirements/run-progress.tsx` — polled run stage list.
- `components/requirements/spec-editor.tsx` — the editor itself.
- `hooks/use-generation-run.ts` + `lib/requirements/editor.ts` — the testable core.
- Payload shapes come from `@sda/contracts` only (`RequirementsSpec`,
  `SaveRequirementsRequest`, `GenerationRun`, `StartRunResponse`).

## States handled

1. **Access gate** (`GET /api/projects/:id`, `GET /api/projects/:id/requirements`):
   the access key is loaded from sessionStorage (`sda:project:<id>:access-key`).
   Missing key → copy directing back to the landing page; 403/404/other errors
   map through the client error registry.
2. **No spec yet** → "Generate requirements" button.
3. **Run** (see below) — requirements generation or architecture generation.
4. **Editor** — tabs Functional / Non-Functional, assumptions + clarifications context panels.
5. **Architecture ready** — honest interim copy: the workspace UI is the next
   phase; the user can return to the editor and re-confirm.

## Run polling

`useGenerationRun` polls `GET /api/runs/:runId` (`x-project-key` header) every
1.2 s while status is `queued|running`, then stops. Stage rows are the
backend-persisted DTO only — the client never simulates stages. Terminal
`succeeded` triggers invalidations of `requirements`, `architecture`, and
`project` queries; `failed`/`interrupted` render the run error banner with a
retry that starts a fresh run (`RUN_CONFLICT` surfaced through the registry).

## Editor semantics

- Interim states (loading, idea-saved, runs, ready, errors) render through
  `components/journey-shell.tsx`: a full-page composition — dotted-field
  backdrop, four-step journey map (Idea → Specification → Architecture →
  Workspace; done/current/upcoming encoded by shape + color + sr-only text),
  and one card per state. `RunProgress` is card-less inside the shell; the
  regen overlay in the workspace reuses the same shell (compact mode).
  Run-state truth stays server-side: stages come from the run DTO only.

- Row text fields are `Textarea`s with `field-sizing: content`: each field
  auto-grows with its text (wraps instead of truncating, capped height), and
  Enter inserts nothing (`blockNewline`) so rows stay single-value.
  Row ids render as short display labels (`F1`, `NF1`, `A1`, `Q1`); the
  backend ids (`fr_…`) stay in state and the save payload only.
- Server-assigned ids used to render as mono chips; short labels replaced
  them for readability (2026-10-24). Local React keys (`local-N`, `new`)
  never leave the client.
- Reorder (up/down buttons) preserves ids attached to their text — covered by
  `lib/requirements/editor.test.ts` (add/edit/delete/move/priority/keys,
  id-stability on reorder, payload shape, empty-text guard).
- Delete of FR/NFR rows and clarifications opens the shared focus-trapped
  Dialog; assumption rows are "retain/discard" (direct discard by design).
- Saving is server-authoritative: the response spec replaces editor rows
  (including newly assigned server ids).
- `confirm: false` = "Save draft" (clears a snapshot per API contract — the
  project returns to `requirements_ready`).
- `confirm: true` = "Confirm & generate architecture": PUT first, then
  `POST /api/projects/:id/architecture` with the stored provider/model options
  and `x-provider-api-key` when saved in this tab. Guards: any empty row
  disables both buttons (`role="status"` hint), all mutations disable while
  pending.

Unanswered clarifications show an `awaiting answer` chip and never block
confirming.

Related: [[Home]] · [[API-Client]] · [[Design-System]]
