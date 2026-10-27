import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateProjectResponse,
  ListProjectsQuery,
  ListProjectsResponse,
  Project,
  ProjectStatus,
  ProjectSummary,
} from "@sda/contracts";
import { ListProjectsQuerySchema } from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AccessKeyService } from "../common/access/access-key.service.js";
import { AppError } from "../common/errors/app-error.js";
import {
  PROJECT_REPOSITORY,
  type ProjectCursor,
  type ProjectRepository,
  type ProjectRow,
} from "../database/repositories/project.repository.js";
import type { UserRow } from "../database/repositories/user.repository.js";
import { PlanService } from "../plans/plan.service.js";
import { toProjectDto } from "./project.mapper.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    private readonly accessKeys: AccessKeyService,
    private readonly plans: PlanService,
  ) {}

  async create(
    idea: string,
    user?: UserRow,
  ): Promise<CreateProjectResponse> {
    await this.plans.assertCanCreateProject(user);
    const { key, hash } = this.accessKeys.generate();
    const project = await this.projects.create({
      id: randomUUID(),
      idea,
      accessKeyHash: hash,
      ownerId: user?.id ?? null,
    });
    return { project: toProjectDto(project), accessKey: key };
  }

  async get(id: string): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    return toProjectDto(project);
  }

  async list(
    user: UserRow,
    query: ListProjectsQuery,
  ): Promise<ListProjectsResponse> {
    const result = await this.projects.listForOwner({
      ownerId: user.id,
      limit: query.limit,
      status: query.status,
      cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
    });
    return {
      projects: result.projects.map(toSummary),
      nextCursor: result.nextCursor
        ? encodeCursor(result.nextCursor)
        : null,
    };
  }

  toDto(project: ProjectRow): Project {
    return toProjectDto(project);
  }

  parseListQuery(query: Record<string, unknown>): ListProjectsQuery {
    const rawLimit = query.limit;
    const parsed = ListProjectsQuerySchema.safeParse({
      cursor: typeof query.cursor === "string" ? query.cursor : undefined,
      limit:
        typeof rawLimit === "string" && rawLimit.trim() !== ""
          ? Number(rawLimit)
          : undefined,
      status:
        typeof query.status === "string"
          ? (query.status as ProjectStatus)
          : undefined,
    });
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Invalid project list query.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}

function toSummary(project: ProjectRow): ProjectSummary {
  const dto = toProjectDto(project);
  return {
    id: dto.id,
    idea: dto.idea,
    ownerId: dto.ownerId,
    status: dto.status,
    confirmedAt: dto.confirmedAt,
    currentArchitectureVersion: dto.currentArchitectureVersion,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function encodeCursor(cursor: ProjectCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString("base64url");
}

function decodeCursor(value: string): ProjectCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { createdAt?: unknown; id?: unknown };
    const createdAt =
      typeof parsed.createdAt === "string"
        ? new Date(parsed.createdAt)
        : null;
    if (
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("Invalid cursor.");
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid project cursor.");
  }
}
