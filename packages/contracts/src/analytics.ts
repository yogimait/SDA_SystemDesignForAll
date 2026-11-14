import { z } from "zod";
import { RunStatusSchema, RunTypeSchema } from "./runs.js";
import { PlanTierSchema } from "./users.js";

export const DashboardRangeSchema = z.enum([
  "last_7_days",
  "last_30_days",
  "last_90_days",
]);
export type DashboardRange = z.infer<typeof DashboardRangeSchema>;

export const DashboardQuerySchema = z.object({
  range: DashboardRangeSchema.default("last_30_days"),
});
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export const DashboardUsageTotalsSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  runCount: z.number().int().min(0),
  projectCount: z.number().int().min(0),
});
export type DashboardUsageTotals = z.infer<typeof DashboardUsageTotalsSchema>;

export const DashboardUsageBucketSchema = DashboardUsageTotalsSchema.extend({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});
export type DashboardUsageBucket = z.infer<typeof DashboardUsageBucketSchema>;

export const TopModelUsageSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(200),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  runCount: z.number().int().min(0),
});
export type TopModelUsage = z.infer<typeof TopModelUsageSchema>;

export const RecentRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: RunTypeSchema,
  status: RunStatusSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  createdAt: z.string().min(1),
  finishedAt: z.string().nullable(),
});
export type RecentRun = z.infer<typeof RecentRunSchema>;

export const DashboardDataSchema = z.object({
  range: DashboardRangeSchema,
  generatedAt: z.string().min(1),
  usage: DashboardUsageTotalsSchema,
  buckets: z.array(DashboardUsageBucketSchema).max(92),
  topModels: z.array(TopModelUsageSchema).max(20),
  recentRuns: z.array(RecentRunSchema).max(20),
});
export type DashboardData = z.infer<typeof DashboardDataSchema>;

/** Ops-only abuse/usage snapshot. Never expose this route without AdminGuard. */
export const AdminAbuseQuerySchema = z.object({
  range: DashboardRangeSchema.default("last_30_days"),
});
export type AdminAbuseQuery = z.infer<typeof AdminAbuseQuerySchema>;

export const AdminAbuseTotalsSchema = z.object({
  totalUsers: z.number().int().min(0),
  newUsers: z.number().int().min(0),
  newProjects: z.number().int().min(0),
  runs: z.number().int().min(0),
  tokens: z.number().int().min(0),
  failures: z.number().int().min(0),
  activeRuns: z.number().int().min(0),
});
export type AdminAbuseTotals = z.infer<typeof AdminAbuseTotalsSchema>;

export const AdminAbuseBucketSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  newUsers: z.number().int().min(0),
  newProjects: z.number().int().min(0),
  runs: z.number().int().min(0),
  tokens: z.number().int().min(0),
  failures: z.number().int().min(0),
});
export type AdminAbuseBucket = z.infer<typeof AdminAbuseBucketSchema>;

export const AdminAbuseUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  planTier: PlanTierSchema,
  runs: z.number().int().min(0),
  tokens: z.number().int().min(0),
  lastRunAt: z.string().nullable(),
});
export type AdminAbuseUser = z.infer<typeof AdminAbuseUserSchema>;

export const AdminAbuseDataSchema = z.object({
  range: DashboardRangeSchema,
  generatedAt: z.string().min(1),
  totals: AdminAbuseTotalsSchema,
  buckets: z.array(AdminAbuseBucketSchema).max(92),
  topUsers: z.array(AdminAbuseUserSchema).max(20),
});
export type AdminAbuseData = z.infer<typeof AdminAbuseDataSchema>;
