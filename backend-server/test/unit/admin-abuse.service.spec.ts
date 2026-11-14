import { describe, expect, it } from "vitest";
import { AdminAbuseService } from "../../src/analytics/admin-abuse.service.js";
import type {
  AbuseAnalyticsRepository,
  AbuseProjectRow,
  AbuseRunRow,
  AbuseUserRow,
} from "../../src/database/repositories/abuse-analytics.repository.js";

const now = Date.now();
const day = 86_400_000;

const users: AbuseUserRow[] = [
  {
    id: "usr_a",
    email: "a@example.com",
    planTier: "free",
    createdAt: new Date(now - day),
  },
  {
    id: "usr_b",
    email: "b@example.com",
    planTier: "pro",
    createdAt: new Date(now - day * 2),
  },
];
const projects: AbuseProjectRow[] = [
  { ownerId: "usr_a", createdAt: new Date(now - day) },
  { ownerId: "usr_b", createdAt: new Date(now - day * 2) },
];
const runs: AbuseRunRow[] = [
  {
    id: "run_a1",
    projectId: "proj_a",
    type: "requirements",
    status: "failed",
    provider: "mock",
    model: "test/model",
    usagePromptTokens: 10,
    usageCompletionTokens: 5,
    createdAt: new Date(now - day),
    finishedAt: new Date(now - day + 1000),
    ownerId: "usr_a",
    ownerEmail: "a@example.com",
    ownerPlanTier: "free",
  },
  {
    id: "run_a2",
    projectId: "proj_a",
    type: "architecture",
    status: "succeeded",
    provider: "mock",
    model: "test/model",
    usagePromptTokens: 20,
    usageCompletionTokens: 10,
    createdAt: new Date(now - day + 2000),
    finishedAt: new Date(now - day + 3000),
    ownerId: "usr_a",
    ownerEmail: "a@example.com",
    ownerPlanTier: "free",
  },
  {
    id: "run_b1",
    projectId: "proj_b",
    type: "requirements",
    status: "succeeded",
    provider: "mock",
    model: "test/model",
    usagePromptTokens: 1,
    usageCompletionTokens: 2,
    createdAt: new Date(now - day * 2),
    finishedAt: new Date(now - day * 2 + 1000),
    ownerId: "usr_b",
    ownerEmail: "b@example.com",
    ownerPlanTier: "pro",
  },
];

const repo: AbuseAnalyticsRepository = {
  listUsersSince: async () => users,
  listProjectsSince: async () => projects,
  listRunsSince: async () => runs,
  countUsers: async () => 3,
  countActiveRuns: async () => 1,
};

describe("AdminAbuseService", () => {
  it("aggregates totals, daily buckets, and top accounts", async () => {
    const service = new AdminAbuseService(repo);
    const data = await service.get("last_7_days");
    expect(data.totals).toEqual({
      totalUsers: 3,
      newUsers: 2,
      newProjects: 2,
      runs: 3,
      tokens: 48,
      failures: 1,
      activeRuns: 1,
    });
    expect(data.buckets).toHaveLength(7);
    expect(data.buckets.reduce((sum, bucket) => sum + bucket.runs, 0)).toBe(3);
    expect(data.buckets.reduce((sum, bucket) => sum + bucket.failures, 0)).toBe(1);
    expect(data.topUsers).toHaveLength(2);
    expect(data.topUsers[0]).toMatchObject({
      email: "a@example.com",
      planTier: "free",
      runs: 2,
      tokens: 45,
    });
    expect(data.topUsers[1]).toMatchObject({
      email: "b@example.com",
      planTier: "pro",
      runs: 1,
      tokens: 3,
    });
  });
});
