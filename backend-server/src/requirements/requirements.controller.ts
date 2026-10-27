import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  GenerationOptions,
  RequirementsResponse,
  SaveRequirementsRequest,
  StartRunResponse,
} from "@sda/contracts";
import {
  GenerationOptionsSchema,
  SaveRequirementsRequestSchema,
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
import { RequirementsService } from "./requirements.service.js";

@Controller("projects/:id/requirements")
@UseGuards(ProjectAccessGuard)
export class RequirementsController {
  constructor(
    private readonly requirements: RequirementsService,
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
    return this.runs.startRequirements(
      requireProject(request),
      options,
      readProviderKey(request),
      request.user,
    );
  }

  @Get()
  get(@Req() request: ProjectRequest): Promise<RequirementsResponse> {
    return this.requirements.get(requireProject(request).id);
  }

  @Put()
  save(
    @Req() request: ProjectRequest,
    @Body(new ZodValidationPipe(SaveRequirementsRequestSchema))
    body: SaveRequirementsRequest,
  ): Promise<RequirementsResponse> {
    return this.requirements.save(requireProject(request).id, body);
  }
}
