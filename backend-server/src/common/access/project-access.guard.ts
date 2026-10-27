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
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../database/repositories/user.repository.js";
import { AppError } from "../errors/app-error.js";
import { AccessKeyService } from "./access-key.service.js";
import {
  AuthContextService,
  type AuthRequest,
} from "./auth-context.service.js";
import { readBearerToken } from "./token.js";

export interface ProjectRequest extends AuthRequest {
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
 * Project-scoped routes accept either the project capability key or a Bearer
 * session for the owner. Anonymous legacy projects still require their key.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly accessKeys: AccessKeyService,
    private readonly auth: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const key = readHeader(request, "x-project-key");
    const hasBearer = readBearerToken(request) !== undefined;
    const user = await this.auth.resolveOptional(request);

    if (!key && !hasBearer) {
      throw new AppError(
        "PROJECT_ACCESS_DENIED",
        "Project access key is required in the x-project-key header.",
      );
    }
    if (hasBearer && !user && !key) {
      throw new AppError("AUTH_REQUIRED");
    }

    const projectId = await this.resolveProjectId(request);
    const project = await this.projects.findWithAccess(projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }

    if (key) {
      if (!this.accessKeys.verify(key, project.accessKeyHash)) {
        throw new AppError("PROJECT_ACCESS_DENIED");
      }
      request.user = project.ownerId
        ? (await this.users.findById(project.ownerId)) ?? undefined
        : user ?? undefined;
      request.project = stripAccessHash(project);
      return true;
    }

    if (!user) {
      throw new AppError(
        "PROJECT_ACCESS_DENIED",
        "Project access key is required in the x-project-key header.",
      );
    }
    if (project.ownerId !== user.id) {
      throw new AppError("PROJECT_ACCESS_DENIED");
    }

    request.user = user;
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
