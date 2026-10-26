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
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  ProjectAccessGuard,
  requireProject,
  type ProjectRequest,
} from "../common/access/project-access.guard.js";
import { readProviderKey } from "../common/http/headers.js";
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
  @UseGuards(ThrottlerGuard)
  start(
    @Req() request: ProjectRequest,
    @Body(new ZodValidationPipe(GenerationOptionsSchema.default({})))
    options: GenerationOptions,
  ): Promise<StartRunResponse> {
    return this.runs.startArchitecture(
      requireProject(request),
      options,
      readProviderKey(request),
    );
  }

  @Post("regenerate")
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  regenerate(
    @Req() request: ProjectRequest,
    @Body(new ZodValidationPipe(RegenerateArchitectureRequestSchema))
    body: RegenerateArchitectureRequest,
  ): Promise<StartRunResponse> {
    return this.runs.startRegeneration(
      requireProject(request),
      body.scope,
      { provider: body.provider, model: body.model },
      readProviderKey(request),
    );
  }

  @Get()
  get(@Req() request: ProjectRequest): Promise<GetArchitectureResponse> {
    return this.architecture.get(requireProject(request).id);
  }
}
