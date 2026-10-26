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
  CreateProjectRequest,
  CreateProjectResponse,
  Project,
} from "@sda/contracts";
import { CreateProjectRequestSchema } from "@sda/contracts";
import {
  ProjectAccessGuard,
  requireProject,
  type ProjectRequest,
} from "../common/access/project-access.guard.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateProjectRequestSchema))
    body: CreateProjectRequest,
  ): Promise<CreateProjectResponse> {
    return this.projects.create(body.idea);
  }

  @Get(":id")
  @UseGuards(ProjectAccessGuard)
  get(@Req() request: ProjectRequest): Project {
    return this.projects.toDto(requireProject(request));
  }
}
