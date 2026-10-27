import type {
  RunStatus,
  RunType,
} from "@sda/contracts";

export interface AnalyticsRunRow {
  id: string;
  projectId: string;
  type: RunType;
  status: RunStatus;
  provider: string;
  model: string;
  usagePromptTokens: number;
  usageCompletionTokens: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface AnalyticsRepository {
  /** Runs belonging to projects owned by the user, created at or after `from`. */
  listRunsByOwner(
    ownerId: string,
    from: Date,
  ): Promise<AnalyticsRunRow[]>;
}

export const ANALYTICS_REPOSITORY = Symbol("ANALYTICS_REPOSITORY");
