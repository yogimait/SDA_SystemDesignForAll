import { Inject, Injectable } from "@nestjs/common";
import type {
  ArchitectureVersion,
  GetArchitectureResponse,
} from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import {
  ARCHITECTURE_REPOSITORY,
  type ArchitectureRepository,
  type ArchitectureVersionRow,
} from "../database/repositories/architecture.repository.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from "../database/repositories/project.repository.js";

@Injectable()
export class ArchitectureService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(ARCHITECTURE_REPOSITORY)
    private readonly architectures: ArchitectureRepository,
  ) {}

  async get(projectId: string): Promise<GetArchitectureResponse> {
    const project = await this.projects.findById(projectId);
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND");
    }
    if (project.currentArchitectureVersion === null) {
      return { version: null };
    }
    const row = await this.architectures.findByProjectAndVersion(
      projectId,
      project.currentArchitectureVersion,
    );
    return { version: row ? toVersionDto(row) : null };
  }
}

function toVersionDto(row: ArchitectureVersionRow): ArchitectureVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    model: row.model,
    validation: row.validationReport,
  };
}
