import type {
  ConfirmedRequirements,
  ProjectStatus,
  RequirementsSpec,
} from "@sda/contracts";
import type { projects } from "../schema.js";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectWithAccess = ProjectRow & { accessKeyHash: string };

export interface CreateProjectInput {
  id: string;
  idea: string;
  accessKeyHash: string;
  ownerId?: string | null;
}

export interface ProjectCursor {
  createdAt: Date;
  id: string;
}

export interface ListProjectsInput {
  ownerId: string;
  limit: number;
  status?: ProjectStatus;
  cursor?: ProjectCursor;
}

export interface ListProjectsResult {
  projects: ProjectRow[];
  nextCursor: ProjectCursor | null;
}

export interface ProjectPatch {
  status?: ProjectStatus;
  requirementsConfirmedAt?: Date | null;
  requirementsSnapshot?: ConfirmedRequirements | null;
  currentArchitectureVersion?: number | null;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRow>;
  findById(id: string): Promise<ProjectRow | null>;
  findWithAccess(id: string): Promise<ProjectWithAccess | null>;
  listForOwner(input: ListProjectsInput): Promise<ListProjectsResult>;
  countForOwner(ownerId: string): Promise<number>;
  update(id: string, patch: ProjectPatch): Promise<ProjectRow | null>;
}

export interface RequirementsRepository {
  findByProjectId(projectId: string): Promise<RequirementsSpec | null>;
  replace(projectId: string, spec: RequirementsSpec): Promise<void>;
}

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
export const REQUIREMENTS_REPOSITORY = Symbol("REQUIREMENTS_REPOSITORY");
