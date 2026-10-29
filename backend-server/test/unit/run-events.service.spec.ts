import { describe, expect, it } from "vitest";
import type {
  GenerationRun,
  RunStreamEvent,
} from "@sda/contracts";
import {
  isStreamEventNewer,
  isTerminalRunStatus,
  replayEventsAfterId,
  RunEventsService,
  streamEventId,
  toRunStreamSnapshot,
} from "../../src/generation/run-events.service.js";

const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function runEvent(
  status: "queued" | "running" | "succeeded",
): RunStreamEvent {
  return {
    type: "run",
    status,
    error: null,
    usage,
    updatedAt: "2026-10-28T00:00:00.000Z",
  };
}

describe("RunEventsService", () => {
  it("publishes only matching run events in order with stable ids", () => {
    const service = new RunEventsService();
    const messages: Array<{ id: string; type: string }> = [];
    const subscription = service.forRun("run-1").subscribe((message) => {
      messages.push({ id: message.id, type: message.event.type });
    });

    service.publish("run-2", runEvent("queued"));
    service.publish("run-1", runEvent("queued"));
    service.publish("run-1", {
      type: "stage",
      name: "analyze_idea",
      status: "running",
      attempt: 0,
      startedAt: "2026-10-28T00:00:00.000Z",
      finishedAt: null,
      error: null,
      usage: null,
    });
    service.publish("run-1", runEvent("succeeded"));

    expect(messages).toEqual([
      { id: "run:queued", type: "run" },
      { id: "stage:analyze_idea:running:0", type: "stage" },
      { id: "run:succeeded", type: "run" },
    ]);
    subscription.unsubscribe();
    service.onModuleDestroy();
  });
});

describe("run stream state", () => {
  const run: GenerationRun = {
    id: "run-1",
    projectId: "project-1",
    type: "requirements",
    status: "running",
    provider: "mock",
    model: "test/model",
    scope: null,
    stages: [
      {
        name: "analyze_idea",
        status: "running",
        attempt: 0,
        startedAt: "2026-10-28T00:00:00.000Z",
        finishedAt: null,
        error: null,
        usage: null,
      },
      {
        name: "persist",
        status: "pending",
        attempt: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
        usage: null,
      },
    ],
    error: null,
    usage,
    createdAt: "2026-10-28T00:00:00.000Z",
    startedAt: "2026-10-28T00:00:01.000Z",
    finishedAt: null,
  };

  it("replays persisted stages in order and then the current run", () => {
    const events = toRunStreamSnapshot(run);
    expect(events.map((event) => event.type)).toEqual([
      "stage",
      "stage",
      "run",
    ]);
    expect(events.map((event) => (event.type === "stage" ? event.name : event.type)))
      .toEqual(["analyze_idea", "persist", "run"]);

    const firstStageId = streamEventId(events[0]!);
    const resumed = replayEventsAfterId(events, firstStageId);
    expect(resumed).toHaveLength(2);
    expect(resumed[0]).toMatchObject({ type: "stage", name: "persist" });
    expect(resumed[1]).toMatchObject({ type: "run", status: "running" });
    // Run frames are snapshots, not stage cursors: replay the full state.
    expect(replayEventsAfterId(events, "run:running")).toEqual(events);
  });

  it("closes only for terminal run statuses", () => {
    expect(isTerminalRunStatus("queued")).toBe(false);
    expect(isTerminalRunStatus("running")).toBe(false);
    expect(isTerminalRunStatus("succeeded")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("interrupted")).toBe(true);
  });

  it("does not forward events older than the persisted snapshot", () => {
    const stale = runEvent("queued");
    const fresh = runEvent("succeeded");
    expect(isStreamEventNewer(stale, run)).toBe(false);
    expect(isStreamEventNewer(fresh, run)).toBe(true);
    expect(
      isStreamEventNewer(
        {
          type: "stage",
          name: "analyze_idea",
          status: "succeeded",
          attempt: 1,
          startedAt: "2026-10-28T00:00:00.000Z",
          finishedAt: "2026-10-28T00:00:02.000Z",
          error: null,
          usage: null,
        },
        run,
      ),
    ).toBe(true);
  });
});
