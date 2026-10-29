import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  GenerationRun,
} from "@sda/contracts";
import type { Response } from "express";
import type { Subscription } from "rxjs";
import { ProjectAccessGuard } from "../common/access/project-access.guard.js";
import type { ProjectRequest } from "../common/access/project-access.guard.js";
import { RunService } from "./run.service.js";
import {
  isStreamEventNewer,
  isTerminalRunStatus,
  replayEventsAfterId,
  RunEventsService,
  streamEventId,
  toRunStreamSnapshot,
  type RunEventMessage,
} from "./run-events.service.js";

const HEARTBEAT_MS = 10_000;

@Controller("runs")
@UseGuards(ProjectAccessGuard)
export class RunController {
  constructor(
    private readonly runs: RunService,
    private readonly events: RunEventsService,
  ) {}

  @Get(":runId/events")
  async stream(
    @Param("runId") runId: string,
    @Req() request: ProjectRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    let finished = false;
    let replaying = true;
    let subscription: Subscription | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const buffered: RunEventMessage[] = [];

    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
      subscription?.unsubscribe();
      if (!response.writableEnded) {
        response.end();
      }
    };

    const writeEvent = (message: RunEventMessage): void => {
      if (finished) return;
      response.write(
        `id: ${message.id}\nevent: ${message.event.type}\ndata: ${JSON.stringify(message.event)}\n\n`,
      );
      if (message.event.type === "run" && isTerminalRunStatus(message.event.status)) {
        finish();
      }
    };

    const onEvent = (message: RunEventMessage): void => {
      if (finished) return;
      if (replaying) {
        buffered.push(message);
        return;
      }
      writeEvent(message);
    };

    subscription = this.events.forRun(runId).subscribe({
      next: onEvent,
      error: () => finish(),
    });
    response.on("close", finish);

    let snapshot: GenerationRun;
    try {
      snapshot = await this.runs.getRun(runId);
    } catch (error) {
      finish();
      throw error;
    }

    const lastEventId =
      firstHeader(request.headers["last-event-id"]) ??
      firstQueryValue(request.query.lastEventId);
    const replay = replayEventsAfterId(
      toRunStreamSnapshot(snapshot),
      lastEventId,
    );
    for (const event of replay) {
      writeEvent({
        runId,
        id: streamEventId(event),
        event,
      });
      if (finished) return;
    }

    replaying = false;
    for (const message of buffered) {
      if (isStreamEventNewer(message.event, snapshot)) {
        writeEvent(message);
      }
      if (finished) return;
    }

    if (finished || isTerminalRunStatus(snapshot.status)) {
      finish();
      return;
    }

    heartbeat = setInterval(() => {
      if (!finished) {
        response.write(": heartbeat\n\n");
      }
    }, HEARTBEAT_MS);
    heartbeat.unref();
  }

  @Get(":runId")
  get(@Param("runId") runId: string): Promise<GenerationRun> {
    return this.runs.getRun(runId);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}
