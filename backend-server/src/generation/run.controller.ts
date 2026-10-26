import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { GenerationRun } from "@sda/contracts";
import { ProjectAccessGuard } from "../common/access/project-access.guard.js";
import { RunService } from "./run.service.js";

@Controller("runs")
@UseGuards(ProjectAccessGuard)
export class RunController {
  constructor(private readonly runs: RunService) {}

  @Get(":runId")
  get(@Param("runId") runId: string): Promise<GenerationRun> {
    return this.runs.getRun(runId);
  }
}
