import { Inject, Injectable } from "@nestjs/common";
import type {
  RequirementsResponse,
  RequirementsSpec,
  SaveRequirementsRequest,
} from "@sda/contracts";
import { RequirementsSpecSchema } from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import { isSpecIdConflict } from "../common/errors/database-error.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from "../database/repositories/project.repository.js";
import {
  REQUIREMENTS_REPOSITORY,
  type RequirementsRepository,
} from "../database/repositories/project.repository.js";
import { newId } from "../generation/requirements.generator.js";

@Injectable()
export class RequirementsService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(REQUIREMENTS_REPOSITORY)
    private readonly requirements: RequirementsRepository,
  ) {}

  async get(projectId: string): Promise<RequirementsResponse> {
    const [project, spec] = await Promise.all([
      this.projects.findById(projectId),
      this.requirements.findByProjectId(projectId),
    ]);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    return {
      spec,
      confirmedAt: project.requirementsConfirmedAt?.toISOString() ?? null,
    };
  }

  async save(
    projectId: string,
    request: SaveRequirementsRequest,
  ): Promise<RequirementsResponse> {
    const spec = this.buildSpec(request);
    try {
      await this.requirements.replace(projectId, spec);
    } catch (error) {
      if (isSpecIdConflict(error)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Requirement, assumption, and clarification ids must be unique across projects.",
          { reason: "duplicate_spec_id" },
        );
      }
      throw error;
    }

    const confirmedAt = request.confirm ? new Date() : null;
    const updated = await this.projects.update(projectId, {
      status: request.confirm ? "requirements_confirmed" : "requirements_ready",
      requirementsConfirmedAt: confirmedAt,
      requirementsSnapshot: confirmedAt
        ? { confirmedAt: confirmedAt.toISOString(), spec }
        : null,
    });
    if (!updated) {
      throw new AppError("PROJECT_NOT_FOUND");
    }

    return {
      spec,
      confirmedAt: updated.requirementsConfirmedAt?.toISOString() ?? null,
    };
  }

  private buildSpec(request: SaveRequirementsRequest): RequirementsSpec {
    const usedIds = new Set<string>();
    const assignId = (prefix: string, provided?: string): string => {
      const id = provided ?? newId(prefix);
      if (usedIds.has(id)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Requirement id "${id}" is duplicated in the request.`,
          { id },
        );
      }
      usedIds.add(id);
      return id;
    };

    const candidate = {
      functional: request.functional.map((item) => ({
        id: assignId("fr", item.id),
        kind: "functional",
        text: item.text,
        priority: item.priority,
      })),
      nonFunctional: request.nonFunctional.map((item) => ({
        id: assignId("nfr", item.id),
        kind: "nonfunctional",
        text: item.text,
        priority: item.priority,
        category: item.category,
        target: item.target,
      })),
      assumptions: request.assumptions.map((item) => ({
        id: assignId("asm", item.id),
        text: item.text,
      })),
      clarifications: request.clarifications.map((item) => ({
        id: assignId("q", item.id),
        question: item.question,
        ...(item.answer ? { answer: item.answer } : {}),
      })),
    };

    const parsed = RequirementsSpecSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The requirements specification is invalid.",
        {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      );
    }
    return parsed.data;
  }
}
