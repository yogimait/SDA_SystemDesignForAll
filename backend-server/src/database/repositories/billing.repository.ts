import type { PlanTier, SubscriptionStatus } from "@sda/contracts";
import type { billingEvents, billingSubscriptions } from "../schema.js";

export type BillingSubscriptionRow = typeof billingSubscriptions.$inferSelect;
export type BillingEventRow = typeof billingEvents.$inferSelect;

export interface UpsertSubscriptionInput {
  id: string;
  userId: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  provider: "stub" | "stripe";
  customerId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  now: Date;
}

export interface RecordBillingEventInput {
  id: string;
  userId?: string | null;
  provider: "stub" | "stripe";
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  processedAt: Date | null;
}

export interface BillingRepository {
  getSubscription(userId: string): Promise<BillingSubscriptionRow | null>;
  findSubscriptionByExternalId(
    subscriptionId: string,
  ): Promise<BillingSubscriptionRow | null>;
  upsertSubscription(
    input: UpsertSubscriptionInput,
  ): Promise<BillingSubscriptionRow>;
  findEvent(idempotencyKey: string): Promise<BillingEventRow | null>;
  /** Returns null when the idempotency key already exists (concurrent insert). */
  recordEvent(input: RecordBillingEventInput): Promise<BillingEventRow | null>;
  markEventProcessed(id: string, at: Date): Promise<void>;
}

export const BILLING_REPOSITORY = Symbol("BILLING_REPOSITORY");
