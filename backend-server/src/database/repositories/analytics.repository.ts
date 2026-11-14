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

export interface GlobalUsage {
  runCount: number;
  promptTokens: number;
  completionTokens: number;
}

export interface AnalyticsRepository {
  /** Runs belonging to projects owned by the user, created at or after `from`. */
  listRunsByOwner(
    ownerId: string,
    from: Date,
  ): Promise<AnalyticsRunRow[]>;

  /** All runs created at or after `from`; used by the global spend guard. */
  sumGlobalUsageSince(from: Date): Promise<GlobalUsage>;
}

export const ANALYTICS_REPOSITORY = Symbol("ANALYTICS_REPOSITORY");
