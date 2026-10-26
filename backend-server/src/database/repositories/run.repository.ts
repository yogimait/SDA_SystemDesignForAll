import type {
  ErrorCode,
  HldModel,
  RegenerateScope,
  RunStatus,
  RunType,
  StageStatus,
} from "@sda/contracts";
import type { generationRuns, generationStages } from "../schema.js";

export type RunRow = typeof generationRuns.$inferSelect;
export type StageRow = typeof generationStages.$inferSelect;

export interface CreateRunInput {
  id: string;
  projectId: string;
  type: RunType;
  provider: string;
  model: string;
  scope: RegenerateScope | null;
  inputHash: string;
  stages: string[];
}

export interface RunPatch {
  status?: RunStatus;
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  usagePromptTokens?: number;
  usageCompletionTokens?: number;
  retryCount?: number;
}

export interface StagePatch {
  status?: StageStatus;
  attempt?: number;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  result?: unknown;
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
  usagePromptTokens?: number;
  usageCompletionTokens?: number;
}

export interface RunRepository {
  create(input: CreateRunInput): Promise<RunRow>;
  findById(id: string): Promise<RunRow | null>;
  listStages(runId: string): Promise<StageRow[]>;
  claimNextQueued(): Promise<RunRow | null>;
  updateRun(id: string, patch: RunPatch): Promise<RunRow | null>;
  updateStage(runId: string, name: string, patch: StagePatch): Promise<void>;
  hasActiveRun(projectId: string): Promise<boolean>;
  reconcileInterrupted(): Promise<number>;
  /** A validated HLD from an earlier failed full run with the same input. */
  findReusableHld(
    projectId: string,
    inputHash: string,
  ): Promise<HldModel | null>;
}

export const RUN_REPOSITORY = Symbol("RUN_REPOSITORY");
