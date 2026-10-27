import { Inject, Injectable } from "@nestjs/common";
import type {
  DashboardData,
  DashboardRange,
  DashboardUsageBucket,
  DashboardUsageTotals,
  RecentRun,
  TopModelUsage,
} from "@sda/contracts";
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
  type AnalyticsRunRow,
} from "../database/repositories/analytics.repository.js";

const RANGE_DAYS: Record<DashboardRange, number> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analytics: AnalyticsRepository,
  ) {}

  async get(userId: string, range: DashboardRange): Promise<DashboardData> {
    const now = new Date();
    const start = startOfUtcDay(
      new Date(now.getTime() - (RANGE_DAYS[range] - 1) * 86_400_000),
    );
    const runs = await this.analytics.listRunsByOwner(userId, start);

    const bucketsByDay = new Map<string, DashboardUsageBucket>();
    for (let index = 0; index < RANGE_DAYS[range]; index += 1) {
      const periodStart = new Date(start.getTime() + index * 86_400_000);
      const periodEnd = new Date(periodStart.getTime() + 86_400_000);
      bucketsByDay.set(dayKey(periodStart), {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        runCount: 0,
        projectCount: 0,
      });
    }

    const totals = emptyTotals();
    const projectIds = new Set<string>();
    const bucketProjects = new Map<string, Set<string>>();
    const models = new Map<string, TopModelUsage>();

    for (const run of runs) {
      const prompt = run.usagePromptTokens;
      const completion = run.usageCompletionTokens;
      const total = prompt + completion;
      addTotals(totals, prompt, completion);
      projectIds.add(run.projectId);

      const key = dayKey(run.createdAt);
      const bucket = bucketsByDay.get(key);
      if (bucket) {
        addTotals(bucket, prompt, completion);
        const set = bucketProjects.get(key) ?? new Set<string>();
        set.add(run.projectId);
        bucketProjects.set(key, set);
      }

      const modelKey = `${run.provider}\u0000${run.model}`;
      const current = models.get(modelKey) ?? {
        provider: run.provider,
        model: run.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        runCount: 0,
      };
      current.promptTokens += prompt;
      current.completionTokens += completion;
      current.totalTokens += total;
      current.runCount += 1;
      models.set(modelKey, current);
    }

    for (const [key, set] of bucketProjects) {
      const bucket = bucketsByDay.get(key);
      if (bucket) bucket.projectCount = set.size;
    }

    return {
      range,
      generatedAt: now.toISOString(),
      usage: {
        ...totals,
        projectCount: projectIds.size,
      },
      buckets: [...bucketsByDay.values()],
      topModels: [...models.values()]
        .sort(
          (a, b) =>
            b.totalTokens - a.totalTokens ||
            b.runCount - a.runCount ||
            a.provider.localeCompare(b.provider) ||
            a.model.localeCompare(b.model),
        )
        .slice(0, 20),
      recentRuns: runs.slice(0, 20).map(toRecentRun),
    };
  }
}

function emptyTotals(): Omit<DashboardUsageTotals, "projectCount"> {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    runCount: 0,
  };
}

function addTotals(
  target: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    runCount: number;
  },
  prompt: number,
  completion: number,
): void {
  target.promptTokens += prompt;
  target.completionTokens += completion;
  target.totalTokens += prompt + completion;
  target.runCount += 1;
}

function toRecentRun(run: AnalyticsRunRow): RecentRun {
  return {
    id: run.id,
    projectId: run.projectId,
    type: run.type,
    status: run.status,
    provider: run.provider,
    model: run.model,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
}

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}
