import {
  RunStreamEventSchema,
  type GenerationRun,
  type RunStreamEvent,
} from "@sda/contracts";

/**
 * Pure run-stream pieces: an SSE frame parser, the reconnect/fallback
 * decision, and the RunStreamEvent → GenerationRun merge, kept free of
 * React so all three are unit-testable.
 *
 * Stream protocol (backend `GET /api/runs/:runId/events`, see
 * backend-server/docs/Generation.md):
 * - on connect the server replays every stage row in position order then the
 *   current run state; frames carry `id:`, `event: run|stage`,
 *   `data: <RunStreamEvent JSON>` — NOT the polling GenerationRun DTO;
 * - `comment` lines are 10s heartbeats; the response closes after a terminal
 *   run event;
 * - `Last-Event-ID` / `?lastEventId=` resumes against the persisted snapshot;
 * - clients merge stage frames themselves (or poll) — this module keeps the
 *   full DTO shape the UI already renders.
 */

export interface SseEvent {
  event: string;
  data: string;
  /** SSE `id:` field — used as Last-Event-ID on reconnect. */
  id: string | null;
}

/** Parses incremental SSE chunks. Partial frames stay buffered across push()
 * calls; multiple frames in one chunk all surface; heartbeats (comment-only
 * frames) and malformed lines never throw. */
export class SseParser {
  private buffer = "";

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];

    // Frames end at a blank line (LF or CRLF).
    for (;;) {
      const boundary = findFrameBoundary(this.buffer);
      if (boundary === null) break;
      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.width);
      const event = parseFrame(frame);
      if (event !== null) events.push(event);
    }
    return events;
  }

  /** EOF: a final frame without its trailing blank line still counts. */
  flush(): SseEvent[] {
    if (this.buffer.trim() === "") return [];
    const event = parseFrame(this.buffer);
    this.buffer = "";
    return event === null ? [] : [event];
  }
}

function findFrameBoundary(buffer: string): { index: number; width: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, width: 4 };
  return { index: lf, width: 2 };
}

function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  let id: string | null = null;
  const dataLines: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine === "" ) continue;
    if (rawLine.startsWith(":")) continue; // heartbeat comment
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    const value = colon === -1 ? "" : rawLine.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
    // unknown fields (retry:) and malformed lines are ignored
  }
  // SSE dispatches only when data is present — comment-only / event-only
  // frames (heartbeats) are not surfaced.
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n"), id };
}

export const MAX_STREAM_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 4_000;

/** Deterministic exponential backoff (no jitter: unit-testable). */
export function backoffDelayMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt));
}

export type StreamFailure =
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "http"; status: number };

/**
 * Retry vs fall back to polling.
 * - 401/403/404 and other definitive 4xx: the stream will never heal →
 *   fall back immediately (also keeps real-backend journeys at zero delay,
 *   because no /events endpoint exists there).
 * - network/timeout/5xx/429: retry with backoff up to MAX_STREAM_ATTEMPTS,
 *   then fall back.
 */
export function classifyFailure(
  failure: StreamFailure,
  attempt: number,
): "retry" | "fallback" {
  if (failure.kind === "http") {
    const s = failure.status;
    if (s === 401 || s === 403 || s === 404) return "fallback";
    const retryable = s === 429 || s >= 500;
    if (!retryable) return "fallback";
    return attempt < MAX_STREAM_ATTEMPTS ? "retry" : "fallback";
  }
  return attempt < MAX_STREAM_ATTEMPTS ? "retry" : "fallback";
}

/** true for succeeded | failed | interrupted. */
export function isTerminalStatus(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "interrupted";
}

/** Frame data → RunStreamEvent, or null when the payload isn't one
 * (GenerationRun-shaped JSON from an old client, garbage, …). */
export function parseRunStreamEvent(data: string): RunStreamEvent | null {
  try {
    const parsed = RunStreamEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Merges one stream event into the full DTO the UI renders. Identity fields
 * (id/projectId/type/provider/model/scope/createdAt…) come from the one-shot
 * bootstrap GET and are never touched here; stage frames patch their row in
 * place (order preserved), run frames patch status/error/usage, heartbeats
 * are no-ops. Returns null while there is no base to merge into.
 */
export function applyRunStreamEvent(
  run: GenerationRun | null,
  event: RunStreamEvent,
): GenerationRun | null {
  if (run === null) return null;
  if (event.type === "heartbeat") return run;
  if (event.type === "run") {
    return { ...run, status: event.status, error: event.error, usage: event.usage };
  }
  const patch = {
    name: event.name,
    status: event.status,
    attempt: event.attempt,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt,
    error: event.error,
    usage: event.usage,
  };
  const index = run.stages.findIndex((stage) => stage.name === event.name);
  if (index === -1) {
    // Defensive: unknown stage (position unknown) — append rather than drop.
    return { ...run, stages: [...run.stages, patch] };
  }
  const stages = run.stages.slice();
  stages[index] = { ...stages[index], ...patch };
  return { ...run, stages };
}

/** Events endpoint with the resume id (query form — no CORS preflight). */
export function eventsUrl(runId: string, lastEventId: string | null): string {
  const base = `/api/runs/${runId}/events`;
  return lastEventId === null
    ? base
    : `${base}?lastEventId=${encodeURIComponent(lastEventId)}`;
}
