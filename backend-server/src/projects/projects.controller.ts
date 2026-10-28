import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ListProjectsResponse,
  Project,
} from "@sda/contracts";
import { CreateProjectRequestSchema } from "@sda/contracts";
import {
  AuthGuard,
} from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ProjectsService } from "./projects.service.js";
import {
  ProjectAccessGuard,
  requireProject,
  type ProjectRequest,
} from "../common/access/project-access.guard.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  create(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(CreateProjectRequestSchema))
    body: CreateProjectRequest,
  ): Promise<CreateProjectResponse> {
    return this.projects.create(body.idea, requireUser(request));
  }

  @Get()
  @UseGuards(AuthGuard)
  list(
    @Req() request: AuthRequest,
    @Query() query: Record<string, unknown>,
  ): Promise<ListProjectsResponse> {
    return this.projects.list(
      requireUser(request),
      this.projects.parseListQuery(query),
    );
  }

  @Get(":id")
  @UseGuards(ProjectAccessGuard)
  get(@Req() request: ProjectRequest): Project {
    return this.projects.toDto(requireProject(request));
  }
}
