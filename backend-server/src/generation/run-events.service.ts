import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  GenerationRun,
  GenerationStage,
  RunError,
  RunStatus,
  RunStreamEvent,
  TokenUsage,
} from "@sda/contracts";
import { filter, Subject, type Observable } from "rxjs";
import type {
  RunRow,
  StagePatch,
} from "../database/repositories/run.repository.js";

export interface RunEventMessage {
  runId: string;
  id: string;
  event: RunStreamEvent;
}

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
  "succeeded",
  "failed",
  "interrupted",
]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/** Stable frame ids let Last-Event-ID resume against persisted state. */
export function streamEventId(event: RunStreamEvent): string {
  switch (event.type) {
    case "run":
      return `run:${event.status}`;
    case "stage":
      return `stage:${event.name}:${event.status}:${event.attempt}`;
    case "heartbeat":
      return `heartbeat:${event.at}`;
  }
}

@Injectable()
export class RunEventsService implements OnModuleDestroy {
  private readonly subject = new Subject<RunEventMessage>();

  publish(runId: string, event: RunStreamEvent): void {
    this.subject.next({
      runId,
      id: streamEventId(event),
      event,
    });
  }

  forRun(runId: string): Observable<RunEventMessage> {
    return this.subject
      .asObservable()
      .pipe(filter((message) => message.runId === runId));
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}

export function toRunStreamRunEvent(
  run: RunRow,
  usage: TokenUsage,
): RunStreamEvent {
  return {
    type: "run",
    status: run.status,
    error: runError(run.errorCode, run.errorMessage, run.errorDetails),
    usage,
    updatedAt:
      run.finishedAt?.toISOString() ??
      run.startedAt?.toISOString() ??
      run.createdAt.toISOString(),
  };
}

export function toRunStreamStageEvent(
  name: string,
  patch: StagePatch,
  startedAt: Date | undefined,
): RunStreamEvent {
  const promptTokens = patch.usagePromptTokens ?? 0;
  const completionTokens = patch.usageCompletionTokens ?? 0;
  return {
    type: "stage",
    name,
    status: patch.status ?? "running",
    attempt: patch.attempt ?? 0,
    startedAt:
      patch.startedAt?.toISOString() ?? startedAt?.toISOString() ?? null,
    finishedAt: patch.finishedAt?.toISOString() ?? null,
    error: runError(
      patch.errorCode,
      patch.errorMessage,
      patch.errorDetails,
    ),
    usage:
      promptTokens > 0 || completionTokens > 0
        ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          }
        : null,
  };
}

export function toRunStreamSnapshot(run: GenerationRun): RunStreamEvent[] {
  return [
    ...run.stages.map(toSnapshotStageEvent),
    {
      type: "run",
      status: run.status,
      error: run.error,
      usage: run.usage,
      updatedAt: run.finishedAt ?? run.startedAt ?? run.createdAt,
    },
  ];
}

export function replayEventsAfterId(
  events: RunStreamEvent[],
  lastEventId: string | undefined,
): RunStreamEvent[] {
  if (!lastEventId) return events;
  // A run frame is a point-in-time state, not a stage cursor. Replaying the
  // full snapshot is safer than assuming no stage changed after it.
  if (lastEventId.startsWith("run:")) return events;
  const index = events.findIndex(
    (event) => streamEventId(event) === lastEventId,
  );
  return index < 0 ? events : events.slice(index + 1);
}

/**
 * Live events may race with the persisted snapshot read. Only forward events
 * that advance the snapshot; otherwise the client can see a stale regression.
 */
export function isStreamEventNewer(
  event: RunStreamEvent,
  snapshot: GenerationRun,
): boolean {
  if (event.type === "run") {
    const current = statusRank(snapshot.status);
    const incoming = statusRank(event.status);
    return incoming > current;
  }
  if (event.type === "stage") {
    const current = snapshot.stages.find((stage) => stage.name === event.name);
    if (!current) return true;
    const currentRank = stageStatusRank(current.status);
    const incomingRank = stageStatusRank(event.status);
    if (incomingRank !== currentRank) return incomingRank > currentRank;
    return event.attempt > current.attempt;
  }
  return false;
}

function toSnapshotStageEvent(stage: GenerationStage): RunStreamEvent {
  return {
    type: "stage",
    name: stage.name,
    status: stage.status,
    attempt: stage.attempt,
    startedAt: stage.startedAt,
    finishedAt: stage.finishedAt,
    error: stage.error,
    usage: stage.usage,
  };
}

function runError(
  code: RunRow["errorCode"] | undefined,
  message: string | null | undefined,
  details: Record<string, unknown> | null | undefined,
): RunError | null {
  if (!code) return null;
  return {
    code,
    message: message ?? "",
    ...(details ? { details } : {}),
  };
}

function statusRank(status: RunStatus): number {
  if (status === "queued") return 0;
  if (status === "running") return 1;
  return 2;
}

function stageStatusRank(status: GenerationStage["status"]): number {
  if (status === "pending") return 0;
  if (status === "running") return 1;
  return 2;
}
