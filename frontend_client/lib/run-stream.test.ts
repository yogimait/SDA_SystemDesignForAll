import { describe, expect, it } from "vitest";
import type { GenerationRun } from "@sda/contracts";
import {
  MAX_STREAM_ATTEMPTS,
  SseParser,
  applyRunStreamEvent,
  backoffDelayMs,
  classifyFailure,
  eventsUrl,
  isTerminalStatus,
  parseRunStreamEvent,
} from "./run-stream";

describe("SseParser — frames across chunk boundaries", () => {
  it("buffers partial frames until the blank line arrives", () => {
    const parser = new SseParser();
    expect(parser.push('event: run\ndata: {"a"')).toEqual([]);
    expect(parser.push(': 1}\n')).toEqual([]);
    const events = parser.push("\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: "run", data: '{"a": 1}', id: null });
  });

  it("captures SSE id fields per frame (Last-Event-ID resume)", () => {
    const parser = new SseParser();
    const events = parser.push("id: evt-1\nevent: stage\ndata: {}\n\nid: evt 2\nevent: run\ndata: {}\n\n");
    expect(events.map((e) => e.id)).toEqual(["evt-1", "evt 2"]);
    expect(parser.push("event: run\ndata: x\n\n")[0]?.id).toBeNull();
  });

  it("returns multiple frames from one chunk, in order", () => {
    const parser = new SseParser();
    const chunk =
      "event: run\ndata: first\n\nevent: run\ndata: second\n\nevent: run\ndata: third\n\n";
    const events = parser.push(chunk);
    expect(events.map((e) => e.data)).toEqual(["first", "second", "third"]);
  });

  it("ignores heartbeat comment frames and event-only frames", () => {
    const parser = new SseParser();
    expect(parser.push(": ping\n\n")).toEqual([]);
    expect(parser.push("event: heartbeat\n\n")).toEqual([]);
    expect(parser.push("event: run\n\n")).toEqual([]);
    // …but a real frame after them still surfaces
    expect(parser.push("event: run\ndata: alive\n\n")).toEqual([
      { event: "run", data: "alive", id: null },
    ]);
  });

  it("never throws on malformed lines and unknown fields", () => {
    const parser = new SseParser();
    expect(parser.push("totally-garbage-line\n\n")).toEqual([]);
    expect(parser.push("retry: 1000\n\n")).toEqual([]);
    expect(parser.push("data: kept\nunknown: x\n\n")).toEqual([
      { event: "message", data: "kept", id: null },
    ]);
  });

  it("joins multiple data lines with newline and handles CRLF", () => {
    const parser = new SseParser();
    const events = parser.push("data: line one\r\ndata: line two\r\n\r\n");
    expect(events).toEqual([{ event: "message", data: "line one\nline two", id: null }]);
    const lf = new SseParser();
    expect(lf.push("data: a\ndata: b\n\n")).toEqual([
      { event: "message", data: "a\nb", id: null },
    ]);
  });

  it("flush emits a final frame missing only its blank line; empty buffer emits nothing", () => {
    const parser = new SseParser();
    expect(parser.push("event: run\ndata: last")).toEqual([]);
    expect(parser.flush()).toEqual([{ event: "run", data: "last", id: null }]);
    expect(parser.flush()).toEqual([]);
    const clean = new SseParser();
    clean.push("event: run\ndata: x\n\n");
    expect(clean.flush()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Real backend frame shape (RunStreamEvent, not the polling DTO) — the D1
// regression: these payloads are what /api/runs/:runId/events actually sends.
// ---------------------------------------------------------------------------

const BASE_RUN: GenerationRun = {
  id: "run_1",
  projectId: "proj_1",
  type: "requirements",
  status: "queued",
  provider: "mock",
  model: "test/model",
  scope: null,
  stages: [
    { name: "analyze_idea", status: "pending", attempt: 0, startedAt: null, finishedAt: null, error: null, usage: null },
    { name: "persist", status: "pending", attempt: 0, startedAt: null, finishedAt: null, error: null, usage: null },
  ],
  error: null,
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  createdAt: "t",
  startedAt: null,
  finishedAt: null,
};

describe("parseRunStreamEvent — real frame payloads", () => {
  it("parses stage, run and heartbeat events", () => {
    expect(
      parseRunStreamEvent(
        '{"type":"stage","name":"analyze_idea","status":"running","attempt":1,"startedAt":"t","finishedAt":null,"error":null,"usage":null}',
      ),
    ).toMatchObject({ type: "stage", name: "analyze_idea", status: "running", attempt: 1 });
    expect(
      parseRunStreamEvent(
        '{"type":"run","status":"running","error":null,"usage":{"promptTokens":1,"completionTokens":2,"totalTokens":3},"updatedAt":"t"}',
      ),
    ).toMatchObject({ type: "run", status: "running" });
    expect(parseRunStreamEvent('{"type":"heartbeat","at":"t"}')).toMatchObject({
      type: "heartbeat",
    });
  });

  it("rejects the old full-DTO frame shape and garbage instead of throwing", () => {
    expect(parseRunStreamEvent(JSON.stringify(BASE_RUN))).toBeNull();
    expect(parseRunStreamEvent("{not json")).toBeNull();
    expect(parseRunStreamEvent("null")).toBeNull();
  });
});

describe("applyRunStreamEvent — merging frames into the DTO view", () => {
  it("patches stage rows in place, keeping identity and order", () => {
    const running = applyRunStreamEvent(
      BASE_RUN,
      parseRunStreamEvent(
        '{"type":"stage","name":"analyze_idea","status":"running","attempt":2,"startedAt":"t","finishedAt":null,"error":null,"usage":null}',
      )!,
    );
    if (running === null) throw new Error("expected a merged run");
    expect(running.stages[0]).toMatchObject({ name: "analyze_idea", status: "running", attempt: 2 });
    expect(running.stages[1]?.status).toBe("pending");
    expect(running.id).toBe("run_1");
    expect(running.provider).toBe("mock");
  });

  it("applies run frames to status/error/usage", () => {
    const failed = applyRunStreamEvent(
      BASE_RUN,
      parseRunStreamEvent(
        '{"type":"run","status":"failed","error":{"code":"GENERATION_REPAIR_FAILED","message":"nope"},"usage":{"promptTokens":5,"completionTokens":6,"totalTokens":11},"updatedAt":"t"}',
      )!,
    );
    if (failed === null) throw new Error("expected a merged run");
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ code: "GENERATION_REPAIR_FAILED" });
    expect(failed.usage.totalTokens).toBe(11);
  });

  it("heartbeats are no-ops and a missing base returns null", () => {
    const heartbeat = parseRunStreamEvent('{"type":"heartbeat","at":"t"}')!;
    expect(applyRunStreamEvent(BASE_RUN, heartbeat)).toBe(BASE_RUN);
    expect(applyRunStreamEvent(null, heartbeat)).toBeNull();
  });

  it("unknown stage names append defensively instead of vanishing", () => {
    const appended = applyRunStreamEvent(
      BASE_RUN,
      parseRunStreamEvent(
        '{"type":"stage","name":"surprise","status":"running","attempt":1,"startedAt":"t","finishedAt":null,"error":null,"usage":null}',
      )!,
    );
    if (appended === null) throw new Error("expected a merged run");
    expect(appended.stages.map((stage) => stage.name)).toEqual([
      "analyze_idea",
      "persist",
      "surprise",
    ]);
  });
});

describe("eventsUrl", () => {
  it("appends the resume id as an encoded query param", () => {
    expect(eventsUrl("run_1", null)).toBe("/api/runs/run_1/events");
    expect(eventsUrl("run_1", "evt 9/x")).toBe(
      "/api/runs/run_1/events?lastEventId=evt%209%2Fx",
    );
  });
});

describe("backoffDelayMs", () => {
  it("doubles per attempt and caps at 4s", () => {
    expect(backoffDelayMs(0)).toBe(500);
    expect(backoffDelayMs(1)).toBe(1_000);
    expect(backoffDelayMs(2)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(4_000);
    expect(backoffDelayMs(9)).toBe(4_000);
    expect(backoffDelayMs(-2)).toBe(500); // defensive: never below base
  });
});

describe("classifyFailure — retry vs polling fallback", () => {
  it("retries network/timeout failures up to the attempt cap", () => {
    for (const kind of ["network", "timeout"] as const) {
      expect(classifyFailure({ kind }, 0)).toBe("retry");
      expect(classifyFailure({ kind }, MAX_STREAM_ATTEMPTS - 1)).toBe("retry");
      expect(classifyFailure({ kind }, MAX_STREAM_ATTEMPTS)).toBe("fallback");
    }
  });

  it("falls back instantly for 401/403/404 (the stream will never heal)", () => {
    for (const status of [401, 403, 404]) {
      expect(classifyFailure({ kind: "http", status }, 0)).toBe("fallback");
      expect(classifyFailure({ kind: "http", status }, 99)).toBe("fallback");
    }
  });

  it("retries 429/5xx up to the cap, falls back for other 4xx", () => {
    for (const status of [429, 500, 503]) {
      expect(classifyFailure({ kind: "http", status }, 0)).toBe("retry");
      expect(classifyFailure({ kind: "http", status }, MAX_STREAM_ATTEMPTS)).toBe(
        "fallback",
      );
    }
    for (const status of [400, 409, 410, 418]) {
      expect(classifyFailure({ kind: "http", status }, 0)).toBe("fallback");
    }
  });
});

describe("isTerminalStatus", () => {
  it("marks succeeded/failed/interrupted as terminal only", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("interrupted")).toBe(true);
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
});
