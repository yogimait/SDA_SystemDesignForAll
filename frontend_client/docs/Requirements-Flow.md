# Requirements Flow

The pending state machine that turns a generated requirements spec into a
confirmed snapshot. Lives under `app/projects/[id]/requirements/`.

- `components/requirements/requirements-flow.tsx` — controller client component.
- `components/requirements/run-progress.tsx` — live stage list (streamed or polled).
- `components/requirements/spec-editor.tsx` — the editor itself.
- `hooks/use-run-stream.ts` (`useRunLive`) + `hooks/use-generation-run.ts`
  + `lib/run-stream.ts` + `lib/requirements/editor.ts` — the testable core.
- Payload shapes come from `@sda/contracts` only (`RequirementsSpec`,
  `SaveRequirementsRequest`, `GenerationRun`, `StartRunResponse`).

## States handled

1. **Back link** — always visible above the state card: signed in → `/library`,
   anonymous (project key only) → `/`. A project page never traps the user.
1. **Provider gate** — a run needs provider + model + that provider's key in
   this tab (`lib/providers/setup.ts`, shared with the dialog's own guard).
   When anything is missing, an inline `Provider setup required` card lists the
   gaps (`Provider missing` / `Model missing` / `API key missing`) and opens the
   shared `ProviderDialog` **on this page** via "Add provider & key" (headers
   keep their compact trigger; the dialog writes sessionStorage and the account
   default). "Generate requirements" and "Confirm & generate architecture" stay
   disabled with explanatory copy until the setup is complete — no provider
   402/`PROVIDER_AUTH_FAILED` should ever be the first feedback. The gate
   re-reads the tab setup after the dialog saves.
2. **Access gate** (`GET /api/projects/:id`, `GET /api/projects/:id/requirements`):
   the access key is loaded from sessionStorage (`sda:project:<id>:access-key`).
   Missing key → copy directing back to the landing page; 403/404/other errors
   map through the client error registry.
3. **No spec yet** → "Generate requirements" button (provider-gated).
4. **Run** (see below) — requirements generation or architecture generation.
5. **Editor** — tabs Functional / Non-Functional, assumptions + clarifications context panels.
6. **Architecture ready** — honest interim copy: the workspace UI is the next
   phase; the user can return to the editor and re-confirm.

## Run updates: live stream with polling fallback

`hooks/use-run-stream.ts` (`useRunLive`) replaces blind polling. The stream
endpoint is the backend's (see `backend-server/docs/Generation.md`):
`GET /api/runs/:runId/events`, fetch()-streamed because EventSource cannot
send `Authorization` / `x-project-key`. Frames are **`RunStreamEvent`** —
`id: …`, `event: run|stage`, `data:{type:"run"|"stage"|"heartbeat",…}` — NOT
the polling DTO. The hook therefore:

1. **bootstraps ONCE** with `GET /api/runs/:runId` for the full
   `GenerationRun` (identity fields: id/provider/model/scope/createdAt), then
2. merges every stream frame into that DTO via `applyRunStreamEvent`
   (`lib/run-stream.ts`): stage frames patch their row in place (position
   preserved, attempt/usage/error included), run frames patch
   status/error/usage, heartbeats are no-ops.

- **Reconnect** with deterministic exponential backoff (`backoffDelayMs`:
  500ms → 1s → 2s, cap 4s) on network/timeout/5xx/429; connect timeout 10s,
  cleared as soon as response headers open (a healthy long-running stream is
  never aborted mid-generation). Idle timeout **60s** (the backend writes a
  `:` comment heartbeat every **10s** — a wide margin avoids live/reconnecting
  flicker while providers think). Reconnects send the last frame `id:` as
  `?lastEventId=` (query form — the documented fallback that needs no CORS
  preflight); the server replays persisted frames, which re-merge cleanly.
- **Fallback** (`classifyFailure`): 401/403/404 and other definitive 4xx
  fall back to polling instantly; repeated failures fall back after 3
  retries. `useRunLive` runs stream OR poll — never both — and closes the
  stream on terminal status or unmount (no leaked readers).
- `useGenerationRun` keeps polling as the fallback path (its `enabled`
  option parks the query while the stream owns the run); both consumers
  (`RunPhase`, `RegenRunPhase`) call `useRunLive`.
- `RunProgress` shows a connection indicator (live / reconnecting /
  connecting / polling — dot + word), visible from the very first connect
  even before a run row exists; the running stage gets
  `aria-current="step"` + a warning tint; repair attempt counts and live
  token usage come from the same frames. The indicator hides once terminal.
- Run-read failures surface mapped copy (never raw HTTP text): `AUTH_REQUIRED`
  offers a Sign in link back to the current route, everything else a Retry.
- Stage rows are still backend-persisted state only — the client never
  simulates stages. Terminal `succeeded` triggers the same invalidations as
  before; `failed`/`interrupted` render the run error banner with retry.
  (Requirements success swaps to the editor, so a terminal `failed` is the
  state that stays visibly rendered — the e2e asserts exactly that; a retry
  starts a fresh run with `RUN_CONFLICT` surfaced through the registry.)

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
  `POST /api/projects/:id/architecture` with the stored **provider + model**
  options and `x-provider-api-key` when saved in this tab (provider and model
  travel together so a non-default provider's key is never sent to another
  provider). Guards: provider setup incomplete, or any empty row, disables both
  buttons (`role="status"` hint for rows, a warning line for the provider
  gate), all mutations disable while pending. A run always uses this
  request-level choice; server env defaults apply only when the request omits
  them.

Unanswered clarifications show an `awaiting answer` chip and never block
confirming.

Related: [[Home]] · [[API-Client]] · [[Design-System]]
