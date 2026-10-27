import type { Project } from "@sda/contracts";
import type { ProjectRow } from "../database/repositories/project.repository.js";

export function toProjectDto(project: ProjectRow): Project {
  return {
    id: project.id,
    idea: project.idea,
    ownerId: project.ownerId,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    confirmedAt: project.requirementsConfirmedAt?.toISOString() ?? null,
    currentArchitectureVersion: project.currentArchitectureVersion,
  };
}
