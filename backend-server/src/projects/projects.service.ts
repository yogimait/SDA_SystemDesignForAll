import { Inject, Injectable } from "@nestjs/common";
import type { CreateProjectResponse, Project } from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AccessKeyService } from "../common/access/access-key.service.js";
import { AppError } from "../common/errors/app-error.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
  type ProjectRow,
} from "../database/repositories/project.repository.js";
import { toProjectDto } from "./project.mapper.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    private readonly accessKeys: AccessKeyService,
  ) {}

  async create(idea: string): Promise<CreateProjectResponse> {
    const { key, hash } = this.accessKeys.generate();
    const project = await this.projects.create({
      id: randomUUID(),
      idea,
      accessKeyHash: hash,
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

  toDto(project: ProjectRow): Project {
    return toProjectDto(project);
  }
}
