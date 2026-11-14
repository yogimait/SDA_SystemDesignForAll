import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminAbuseBucket,
  AdminAbuseData,
  AdminAbuseUser,
  DashboardRange,
} from "@sda/contracts";
import {
  ABUSE_ANALYTICS_REPOSITORY,
  type AbuseAnalyticsRepository,
} from "../database/repositories/abuse-analytics.repository.js";

const RANGE_DAYS: Record<DashboardRange, number> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
};

@Injectable()
export class AdminAbuseService {
  constructor(
    @Inject(ABUSE_ANALYTICS_REPOSITORY)
    private readonly analytics: AbuseAnalyticsRepository,
  ) {}

  async get(range: DashboardRange): Promise<AdminAbuseData> {
    const now = new Date();
    const start = startOfUtcDay(
      new Date(now.getTime() - (RANGE_DAYS[range] - 1) * 86_400_000),
    );
    const [users, projects, runs, totalUsers, activeRuns] = await Promise.all([
      this.analytics.listUsersSince(start),
      this.analytics.listProjectsSince(start),
      this.analytics.listRunsSince(start),
      this.analytics.countUsers(),
      this.analytics.countActiveRuns(),
    ]);

    const buckets = new Map<string, AdminAbuseBucket>();
    for (let index = 0; index < RANGE_DAYS[range]; index += 1) {
      const periodStart = new Date(start.getTime() + index * 86_400_000);
      const periodEnd = new Date(periodStart.getTime() + 86_400_000);
      buckets.set(dayKey(periodStart), {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        newUsers: 0,
        newProjects: 0,
        runs: 0,
        tokens: 0,
        failures: 0,
      });
    }

    for (const user of users) {
      const bucket = buckets.get(dayKey(user.createdAt));
      if (bucket) bucket.newUsers += 1;
    }
    for (const project of projects) {
      const bucket = buckets.get(dayKey(project.createdAt));
      if (bucket) bucket.newProjects += 1;
    }

    const topUsers = new Map<string, AdminAbuseUser>();
    let tokens = 0;
    let failures = 0;
    for (const run of runs) {
      const total = run.usagePromptTokens + run.usageCompletionTokens;
      tokens += total;
      const failed = run.status === "failed" || run.status === "interrupted";
      if (failed) failures += 1;
      const bucket = buckets.get(dayKey(run.createdAt));
      if (bucket) {
        bucket.runs += 1;
        bucket.tokens += total;
        if (failed) bucket.failures += 1;
      }
      if (run.ownerId && run.ownerEmail) {
        const current = topUsers.get(run.ownerId) ?? {
          id: run.ownerId,
          email: run.ownerEmail,
          planTier: run.ownerPlanTier ?? "free",
          runs: 0,
          tokens: 0,
          lastRunAt: null,
        };
        current.runs += 1;
        current.tokens += total;
        const created = run.createdAt.toISOString();
        if (current.lastRunAt === null || created > current.lastRunAt) {
          current.lastRunAt = created;
        }
        topUsers.set(run.ownerId, current);
      }
    }

    return {
      range,
      generatedAt: now.toISOString(),
      totals: {
        totalUsers,
        newUsers: users.length,
        newProjects: projects.length,
        runs: runs.length,
        tokens,
        failures,
        activeRuns,
      },
      buckets: [...buckets.values()],
      topUsers: [...topUsers.values()]
        .sort(
          (a, b) =>
            b.tokens - a.tokens ||
            b.runs - a.runs ||
            a.email.localeCompare(b.email),
        )
        .slice(0, 20),
    };
  }
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
