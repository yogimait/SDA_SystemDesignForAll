"use client";

/**
 * Live run streaming + polling fallback.
 *
 * `useRunStream` bootstraps the full `GenerationRun` DTO with ONE
 * `GET /api/runs/:runId` fetch, then opens `GET /api/runs/:runId/events`
 * with fetch() streaming (not EventSource, so Authorization / x-project-key
 * headers travel) and merges `RunStreamEvent` frames — `{type:"run"}`,
 * `{type:"stage"}`, `{type:"heartbeat"}` — into that DTO
 * (`applyRunStreamEvent`). Frame `id:` values resume via `?lastEventId=`.
 * Reconnects use deterministic exponential backoff; headers open clears the
 * connect timer, and the 60s idle timeout clears the backend's 10s heartbeats
 * with margin. Definitive failures
 * (401/403/404 and other non-retryable HTTP) and repeated failures fall
 * back to polling — `useRunLive` runs stream OR poll for a run, never both,
 * and closes the stream on terminal status or unmount.
 */

import { useEffect, useState } from "react";
import { GenerationRunSchema, type GenerationRun } from "@sda/contracts";
import {
  API_BASE_URL,
  ApiError,
  USER_MESSAGES,
  apiFetch,
  type ApiErrorCode,
} from "@/lib/api/client";
import { loadSession } from "@/lib/session/auth";
import {
  SseParser,
  applyRunStreamEvent,
  backoffDelayMs,
  classifyFailure,
  eventsUrl,
  isTerminalStatus,
  parseRunStreamEvent,
  type SseEvent,
  type StreamFailure,
} from "@/lib/run-stream";
import { useGenerationRun } from "@/hooks/use-generation-run";

export type StreamConnection = "connecting" | "live" | "reconnecting" | "closed";
/** What RunProgress shows: the stream states plus the polling fallback. */
export type RunConnection = StreamConnection | "polling";

const CONNECT_TIMEOUT_MS = 10_000;
/** Must clear the backend's 10s comment heartbeat with a wide margin. The
 * heartbeat arrives every 10s; a 60s idle window avoids reconnect churn on
 * slow provider calls. */
const IDLE_TIMEOUT_MS = 60_000;

function failureFromStatus(status: number): ApiError {
  const code: ApiErrorCode =
    status === 401
      ? "AUTH_REQUIRED"
      : status === 403
        ? "PROJECT_ACCESS_DENIED"
        : status === 404
          ? "RUN_NOT_FOUND"
          : status === 429
            ? "QUOTA_EXCEEDED"
            : status >= 500
              ? "INTERNAL_ERROR"
              : "INVALID_RESPONSE";
  return new ApiError(code, {
    userMessage: USER_MESSAGES[code],
    message: `run stream: HTTP ${status}`,
    statusCode: status,
  });
}

export interface RunStreamState {
  run: GenerationRun | null;
  error: ApiError | null;
  connection: StreamConnection;
  /** true once the stream gave up — polling owns the run from here. */
  fallback: boolean;
}

export function useRunStream(
  runId: string | null,
  projectKey: string | null,
): RunStreamState {
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [connection, setConnection] = useState<StreamConnection>("closed");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (runId === null || runId === "") {
      // Deferred off the effect body (react-hooks/set-state-in-effect).
      const closeTimer = window.setTimeout(() => setConnection("closed"), 0);
      return () => window.clearTimeout(closeTimer);
    }
    /** Narrowed id: parameters widen back inside closures. */
    const activeRunId: string = runId;

    let cancelled = false;
    let attempt = 0;
    let controller: AbortController | null = null;
    let retryTimer: number | null = null;
    let connectTimer: number | null = null;
    let idleTimer: number | null = null;
    /** "unmount" = silent, "timeout" = retryable failure. */
    let abortReason: "unmount" | "timeout" | null = null;
    let openedOnce = false;
    /** Full DTO from the one-shot bootstrap; stream frames merge into it. */
    let currentRun: GenerationRun | null = null;
    let bootstrapped = false;
    /** Last SSE `id:` seen — sent as ?lastEventId= on reconnect (resume). */
    let lastEventId: string | null = null;

    const headers: Record<string, string> = { accept: "text/event-stream" };
    const session = loadSession();
    if (session !== null) headers.authorization = `Bearer ${session.accessToken}`;
    if (projectKey !== null && projectKey !== "") {
      headers["x-project-key"] = projectKey;
    }

    function clearTimers(): void {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (connectTimer !== null) window.clearTimeout(connectTimer);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      retryTimer = connectTimer = idleTimer = null;
    }

    function giveUp(err: ApiError): void {
      if (cancelled) return;
      clearTimers();
      setConnection("closed");
      setError(err);
      setFallback(true);
    }

    function handleFailure(failure: StreamFailure, err: ApiError): void {
      if (cancelled) return;
      if (classifyFailure(failure, attempt) === "fallback") {
        giveUp(err);
        return;
      }
      const delay = backoffDelayMs(attempt);
      attempt += 1;
      setConnection("reconnecting");
      retryTimer = window.setTimeout(() => {
        void open();
      }, delay);
    }

    /** One SSE frame → merged run view; true when the run went terminal. */
    function acceptFrame(frame: SseEvent): boolean {
      const event = parseRunStreamEvent(frame.data);
      if (event === null) return false; // malformed / foreign payload — ignore
      attempt = 0; // valid event: the stream is healthy
      if (frame.id !== null) lastEventId = frame.id;
      setError(null);
      currentRun = applyRunStreamEvent(currentRun, event);
      if (currentRun !== null) setRun(currentRun);
      setConnection("live");
      return currentRun !== null && isTerminalStatus(currentRun.status);
    }

    async function open(): Promise<void> {
      if (cancelled) return;
      abortReason = null;
      controller = new AbortController();
      setConnection(openedOnce ? "reconnecting" : "connecting");
      openedOnce = true;
      connectTimer = window.setTimeout(() => {
        abortReason = "timeout";
        controller?.abort();
      }, CONNECT_TIMEOUT_MS);

      // One-shot bootstrap: stream frames carry no identity (id/provider/
      // model), so the full DTO comes from the same endpoint polling uses.
      // Runs once per effect — reconnects resume with ?lastEventId= instead.
      if (!bootstrapped) {
        try {
          const base = await apiFetch<GenerationRun>(`/api/runs/${activeRunId}`, {
            projectKey,
            auth: session !== null,
            dataSchema: GenerationRunSchema,
            signal: controller.signal,
          });
          if (cancelled) return;
          bootstrapped = true;
          currentRun = base;
          setRun(base);
        } catch (cause) {
          if (cancelled) return;
          // Stop the attempt timer: handleFailure owns the schedule from here.
          if (connectTimer !== null) {
            window.clearTimeout(connectTimer);
            connectTimer = null;
          }
          const api = cause instanceof ApiError ? cause : null;
          if (api !== null && api.statusCode !== null) {
            handleFailure({ kind: "http", status: api.statusCode }, api);
          } else {
            const timedOut =
              cause instanceof DOMException &&
              (cause.name === "TimeoutError" || cause.name === "AbortError");
            handleFailure(
              timedOut ? { kind: "timeout" } : { kind: "network" },
              new ApiError("NETWORK_ERROR", {
                userMessage: USER_MESSAGES.NETWORK_ERROR,
                message: "run stream: bootstrap fetch failed",
                cause,
              }),
            );
          }
          return;
        }
      }

      try {
        const res = await fetch(`${API_BASE_URL}${eventsUrl(activeRunId, lastEventId)}`, {
          headers,
          signal: controller.signal,
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          handleFailure({ kind: "http", status: res.status }, failureFromStatus(res.status));
          return;
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.body || !contentType.includes("text/event-stream")) {
          giveUp(
            new ApiError("INVALID_RESPONSE", {
              userMessage: USER_MESSAGES.INVALID_RESPONSE,
              message: "run stream: response is not a text/event-stream body",
            }),
          );
          return;
        }

        // Headers are in: the connection is open, so stop the connect timer
        // before streaming. Leaving it armed aborts healthy long-running
        // streams before the first heartbeat and causes live/reconnecting churn.
        if (connectTimer !== null) {
          window.clearTimeout(connectTimer);
          connectTimer = null;
        }

        setConnection("live");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();

        for (;;) {
          idleTimer = window.setTimeout(() => {
            abortReason = "timeout";
            controller?.abort();
          }, IDLE_TIMEOUT_MS);
          const { done, value } = await reader.read();
          if (idleTimer !== null) {
            window.clearTimeout(idleTimer);
            idleTimer = null;
          }
          if (cancelled) {
            await reader.cancel().catch(() => undefined);
            return;
          }
          if (done) {
            // EOF: flush a final frame that lacked its blank line.
            let sawTerminal = false;
            for (const frame of parser.flush()) {
              if (acceptFrame(frame)) sawTerminal = true;
            }
            if (sawTerminal) {
              setConnection("closed");
              return;
            }
            // Server closed without a terminal frame — retry with the resume
            // id (counted, so a connection that never delivers still falls
            // back).
            handleFailure(
              { kind: "network" },
              new ApiError("NETWORK_ERROR", {
                userMessage: USER_MESSAGES.NETWORK_ERROR,
                message: "run stream: connection closed before a terminal state",
              }),
            );
            return;
          }
          let terminal = false;
          for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
            if (acceptFrame(frame)) terminal = true;
          }
          if (terminal) {
            setConnection("closed");
            await reader.cancel().catch(() => undefined);
            return;
          }
        }
      } catch (cause) {
        if (cancelled) return;
        if (abortReason === "unmount") return;
        const timedOut = abortReason === "timeout";
        handleFailure(
          timedOut ? { kind: "timeout" } : { kind: "network" },
          new ApiError("NETWORK_ERROR", {
            userMessage: USER_MESSAGES.NETWORK_ERROR,
            message: timedOut
              ? "run stream: connect/idle timeout"
              : "run stream: connection lost",
            cause,
          }),
        );
      } finally {
        if (connectTimer !== null) {
          window.clearTimeout(connectTimer);
          connectTimer = null;
        }
      }
    }

    // Boot deferred off the effect body (react-hooks/set-state-in-effect):
    // reset per-run state, then open the stream.
    const boot = window.setTimeout(() => {
      setRun(null);
      setError(null);
      setFallback(false);
      void open();
    }, 0);

    return () => {
      cancelled = true;
      abortReason = "unmount";
      window.clearTimeout(boot);
      clearTimers();
      controller?.abort();
    };
  }, [runId, projectKey]);

  return { run, error, connection, fallback };
}

export interface RunLiveState {
  run: GenerationRun | null;
  error: Error | null;
  isLoading: boolean;
  connection: RunConnection;
}

/**
 * The hook consumers use: stream first, polling only after the stream gives
 * up — never both at once for the same run.
 */
export function useRunLive(
  runId: string | null,
  projectKey: string | null,
): RunLiveState {
  const stream = useRunStream(runId, projectKey);
  const pollEnabled = runId !== null && runId !== "" && stream.fallback;
  const polling = useGenerationRun(runId ?? "", projectKey, { enabled: pollEnabled });

  const noRun = runId === null || runId === "";
  const run = stream.fallback ? (polling.run ?? stream.run) : stream.run;
  const error: Error | null = stream.fallback ? polling.error : stream.error;
  const isLoading =
    !noRun && run === null && error === null && (stream.fallback ? polling.isLoading : true);
  const connection: RunConnection = noRun
    ? "closed"
    : stream.fallback
      ? "polling"
      : stream.connection;

  return { run, error, isLoading, connection };
}

/** Re-export so consumers keep one import site alongside the terminal effect. */
export { useRunTerminalEffect } from "@/hooks/use-generation-run";
