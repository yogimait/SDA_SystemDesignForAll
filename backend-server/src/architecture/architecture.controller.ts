import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  GenerationOptions,
  GetArchitectureResponse,
  RegenerateArchitectureRequest,
  StartRunResponse,
} from "@sda/contracts";
import {
  GenerationOptionsSchema,
  RegenerateArchitectureRequestSchema,
} from "@sda/contracts";
import { GenerationThrottlerGuard } from "../common/access/generation-throttler.guard.js";
import {
  ProjectAccessGuard,
  requireProject,
  type ProjectRequest,
} from "../common/access/project-access.guard.js";
import { RequireVerifiedEmailGuard } from "../common/access/verified-email.guard.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { RunService } from "../generation/run.service.js";
import { ArchitectureService } from "./architecture.service.js";

@Controller("projects/:id/architecture")
@UseGuards(ProjectAccessGuard)
export class ArchitectureController {
  constructor(
    private readonly architecture: ArchitectureService,
    private readonly runs: RunService,
  ) {}

  @Post()
  @HttpCode(202)
  @UseGuards(GenerationThrottlerGuard, RequireVerifiedEmailGuard)
  start(
    @Req() request: ProjectRequest,
    @Body(new ZodValidationPipe(GenerationOptionsSchema.default({})))
    options: GenerationOptions,
  ): Promise<StartRunResponse> {
    return this.runs.startArchitecture(
      requireProject(request),
      options,
      request.user,
    );
  }

  @Post("regenerate")
  @HttpCode(202)
  @UseGuards(GenerationThrottlerGuard, RequireVerifiedEmailGuard)
  regenerate(
    @Req() request: ProjectRequest,
    @Body(new ZodValidationPipe(RegenerateArchitectureRequestSchema))
    body: RegenerateArchitectureRequest,
  ): Promise<StartRunResponse> {
    return this.runs.startRegeneration(
      requireProject(request),
      body.scope,
      { provider: body.provider, model: body.model },
      request.user,
    );
  }

  @Get()
  get(@Req() request: ProjectRequest): Promise<GetArchitectureResponse> {
    return this.architecture.get(requireProject(request).id);
  }
}
