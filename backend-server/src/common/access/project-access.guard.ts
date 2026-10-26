import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
  type ProjectRow,
  type ProjectWithAccess,
} from "../../database/repositories/project.repository.js";
import {
  RUN_REPOSITORY,
  type RunRepository,
} from "../../database/repositories/run.repository.js";
import { AppError } from "../errors/app-error.js";
import { AccessKeyService } from "./access-key.service.js";

export interface ProjectRequest extends Request {
  project?: ProjectRow;
}

export function requireProject(request: ProjectRequest): ProjectRow {
  if (!request.project) {
    throw new AppError("PROJECT_ACCESS_DENIED");
  }
  return request.project;
}

function readHeader(request: Request, name: string): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Every project-scoped route requires `x-project-key`. A run id resolves to its
 * project first so run polling is protected by the same key.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly accessKeys: AccessKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const key = readHeader(request, "x-project-key");
    if (!key) {
      throw new AppError(
        "PROJECT_ACCESS_DENIED",
        "Project access key is required in the x-project-key header.",
      );
    }

    const projectId = await this.resolveProjectId(request);
    const project = await this.projects.findWithAccess(projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    if (!this.accessKeys.verify(key, project.accessKeyHash)) {
      throw new AppError("PROJECT_ACCESS_DENIED");
    }

    request.project = stripAccessHash(project);
    return true;
  }

  private async resolveProjectId(request: ProjectRequest): Promise<string> {
    const runId = firstParam(request.params.runId);
    if (runId) {
      const run = await this.runs.findById(runId);
      if (!run) {
        throw new AppError("RUN_NOT_FOUND");
      }
      return run.projectId;
    }

    const projectId = firstParam(request.params.id);
    if (!projectId) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    return projectId;
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stripAccessHash(project: ProjectWithAccess): ProjectRow {
  const { accessKeyHash: _accessKeyHash, ...rest } = project;
  return rest;
}
