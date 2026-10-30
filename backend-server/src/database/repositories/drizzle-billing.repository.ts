import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { billingEvents, billingSubscriptions } from "../schema.js";
import type {
  BillingEventRow,
  BillingRepository,
  BillingSubscriptionRow,
  RecordBillingEventInput,
  UpsertSubscriptionInput,
} from "./billing.repository.js";

@Injectable()
export class DrizzleBillingRepository implements BillingRepository {
  constructor(private readonly database: DatabaseService) {}

  async getSubscription(userId: string): Promise<BillingSubscriptionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async findSubscriptionByExternalId(
    subscriptionId: string,
  ): Promise<BillingSubscriptionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.subscriptionId, subscriptionId))
      .limit(1);
    return row ?? null;
  }

  async upsertSubscription(
    input: UpsertSubscriptionInput,
  ): Promise<BillingSubscriptionRow> {
    const [row] = await this.database.db
      .insert(billingSubscriptions)
      .values({
        id: input.id,
        userId: input.userId,
        plan: input.plan,
        status: input.status,
        provider: input.provider,
        customerId: input.customerId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: billingSubscriptions.userId,
        set: {
          plan: input.plan,
          status: input.status,
          provider: input.provider,
          customerId: input.customerId ?? null,
          subscriptionId: input.subscriptionId ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          updatedAt: input.now,
        },
      })
      .returning();
    return row;
  }

  async findEvent(idempotencyKey: string): Promise<BillingEventRow | null> {
    const [row] = await this.database.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.idempotencyKey, idempotencyKey))
      .limit(1);
    return row ?? null;
  }

  async recordEvent(
    input: RecordBillingEventInput,
  ): Promise<BillingEventRow | null> {
    const [row] = await this.database.db
      .insert(billingEvents)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async markEventProcessed(id: string, at: Date): Promise<void> {
    await this.database.db
      .update(billingEvents)
      .set({ processedAt: at })
      .where(eq(billingEvents.id, id));
  }
}
