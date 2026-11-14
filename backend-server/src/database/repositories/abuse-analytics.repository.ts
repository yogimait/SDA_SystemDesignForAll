import type { PlanTier } from "@sda/contracts";
import type { AnalyticsRunRow } from "./analytics.repository.js";

export interface AbuseUserRow {
  id: string;
  email: string;
  planTier: PlanTier;
  createdAt: Date;
}

export interface AbuseProjectRow {
  ownerId: string | null;
  createdAt: Date;
}

export interface AbuseRunRow extends AnalyticsRunRow {
  ownerId: string | null;
  ownerEmail: string | null;
  ownerPlanTier: PlanTier | null;
}

export interface AbuseAnalyticsRepository {
  listUsersSince(from: Date): Promise<AbuseUserRow[]>;
  listProjectsSince(from: Date): Promise<AbuseProjectRow[]>;
  listRunsSince(from: Date): Promise<AbuseRunRow[]>;
  countUsers(): Promise<number>;
  countActiveRuns(): Promise<number>;
}

export const ABUSE_ANALYTICS_REPOSITORY = Symbol("ABUSE_ANALYTICS_REPOSITORY");
