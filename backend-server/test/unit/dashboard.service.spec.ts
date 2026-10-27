import { describe, expect, it } from "vitest";
import { DashboardService } from "../../src/analytics/dashboard.service.js";
import type { AnalyticsRunRow } from "../../src/database/repositories/analytics.repository.js";

const now = new Date();
const today = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
);
const yesterday = new Date(today.getTime() - 86_400_000);

const runs: AnalyticsRunRow[] = [
  {
    id: "run_today",
    projectId: "project_a",
    type: "architecture",
    status: "succeeded",
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usagePromptTokens: 100,
    usageCompletionTokens: 50,
    createdAt: today,
    finishedAt: today,
  },
  {
    id: "run_yesterday",
    projectId: "project_b",
    type: "requirements",
    status: "failed",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    usagePromptTokens: 10,
    usageCompletionTokens: 5,
    createdAt: yesterday,
    finishedAt: yesterday,
  },
];

describe("DashboardService", () => {
  it("aggregates totals, daily buckets, models, and recent runs", async () => {
    const service = new DashboardService({
      listRunsByOwner: async () => runs,
    } as never);

    const dashboard = await service.get("usr_test", "last_7_days");

    expect(dashboard.range).toBe("last_7_days");
    expect(dashboard.buckets).toHaveLength(7);
    expect(dashboard.usage).toEqual({
      promptTokens: 110,
      completionTokens: 55,
      totalTokens: 165,
      runCount: 2,
      projectCount: 2,
    });
    expect(dashboard.topModels).toHaveLength(2);
    expect(dashboard.topModels[0]).toMatchObject({
      provider: "openrouter",
      totalTokens: 150,
      runCount: 1,
    });
    expect(dashboard.recentRuns.map((run) => run.id)).toEqual([
      "run_today",
      "run_yesterday",
    ]);

    const todayBucket = dashboard.buckets.find(
      (bucket) =>
        bucket.periodStart <= today.toISOString() &&
        bucket.periodEnd > today.toISOString(),
    );
    expect(todayBucket).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      runCount: 1,
      projectCount: 1,
    });
  });
});
