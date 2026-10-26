import type {
  ArchitectureModel,
  ConfirmedRequirements,
  ValidationReport,
} from "@sda/contracts";
import type { architectureVersions } from "../schema.js";

export type ArchitectureVersionRow =
  typeof architectureVersions.$inferSelect;

export interface CreateArchitectureVersionInput {
  id: string;
  projectId: string;
  version: number;
  model: ArchitectureModel;
  validationReport: ValidationReport;
  requirementsSnapshot: ConfirmedRequirements;
  createdByRunId: string | null;
}

export interface ArchitectureRepository {
  nextVersion(projectId: string): Promise<number>;
  create(input: CreateArchitectureVersionInput): Promise<ArchitectureVersionRow>;
  findByProjectAndVersion(
    projectId: string,
    version: number,
  ): Promise<ArchitectureVersionRow | null>;
  findLatest(projectId: string): Promise<ArchitectureVersionRow | null>;
}

export const ARCHITECTURE_REPOSITORY = Symbol("ARCHITECTURE_REPOSITORY");
