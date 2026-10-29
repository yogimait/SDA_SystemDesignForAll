import type { GenerationRun } from "@sda/contracts";
import type { Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRequest } from "../../src/common/access/project-access.guard.js";
import { RunController } from "../../src/generation/run.controller.js";
import { RunEventsService } from "../../src/generation/run-events.service.js";
import type { RunService } from "../../src/generation/run.service.js";

const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const HEARTBEAT_FRAME = ": heartbeat\n\n";
/** Must match HEARTBEAT_MS in run.controller.ts; below the client idle timeout. */
const HEARTBEAT_MS = 10_000;

function generationRun(
  status: GenerationRun["status"] = "running",
): GenerationRun {
  return {
    id: "run-1",
    projectId: "project-1",
    type: "requirements",
    status,
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
    finishedAt: status === "succeeded" ? "2026-10-28T00:00:05.000Z" : null,
  };
}

interface FakeStream {
  request: ProjectRequest;
  response: Response;
  chunks: string[];
  ended: () => boolean;
}

function fakeStream(): FakeStream {
  const chunks: string[] = [];
  let ended = false;
  const response = {
    status: () => response,
    setHeader: () => response,
    flushHeaders: () => undefined,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    end: () => {
      ended = true;
    },
    on: () => response,
    get writableEnded() {
      return ended;
    },
  };
  return {
    request: { headers: {}, query: {} } as unknown as ProjectRequest,
    response: response as unknown as Response,
    chunks,
    ended: () => ended,
  };
}

function controllerFor(
  run: GenerationRun,
  events: RunEventsService,
): RunController {
  const runs = { getRun: async () => run } as unknown as RunService;
  return new RunController(runs, events);
}

describe("run stream heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a comment heartbeat every interval without breaking frame order", async () => {
    vi.useFakeTimers();
    const events = new RunEventsService();
    const stream = fakeStream();
    await controllerFor(generationRun(), events).stream(
      "run-1",
      stream.request,
      stream.response,
    );

    // Replayed snapshot: two stage frames then the run frame.
    expect(stream.chunks).toHaveLength(3);
    for (const chunk of stream.chunks) {
      expect(chunk).toMatch(/^id: [^\n]+\nevent: [^\n]+\ndata: [^\n]+\n\n$/);
    }

    events.publish("run-1", {
      type: "stage",
      name: "persist",
      status: "running",
      attempt: 0,
      startedAt: "2026-10-28T00:00:02.000Z",
      finishedAt: null,
      error: null,
      usage: null,
    });
    expect(stream.chunks).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1);
    expect(stream.chunks).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(1);
    expect(stream.chunks).toHaveLength(5);
    expect(stream.chunks.at(-1)).toBe(HEARTBEAT_FRAME);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(stream.chunks.filter((chunk) => chunk === HEARTBEAT_FRAME)).toHaveLength(
      2,
    );

    // The comment frame carries no id/event/data, so it cannot advance replay.
    expect(stream.chunks.filter((chunk) => chunk.startsWith(":"))).toEqual([
      HEARTBEAT_FRAME,
      HEARTBEAT_FRAME,
    ]);

    events.publish("run-1", {
      type: "run",
      status: "succeeded",
      error: null,
      usage,
      updatedAt: "2026-10-28T00:00:05.000Z",
    });
    expect(stream.ended()).toBe(true);
    const written = stream.chunks.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 6);
    expect(stream.chunks).toHaveLength(written);
  });

  it("closes a terminal run without ever starting a heartbeat", async () => {
    vi.useFakeTimers();
    const events = new RunEventsService();
    const stream = fakeStream();
    await controllerFor(generationRun("succeeded"), events).stream(
      "run-1",
      stream.request,
      stream.response,
    );

    expect(stream.ended()).toBe(true);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 6);
    expect(stream.chunks.filter((chunk) => chunk.startsWith(":"))).toEqual([]);
  });
});
