import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import type {
  BillingEventRow,
  BillingSubscriptionRow,
  UpsertSubscriptionInput,
} from "../../src/database/repositories/billing.repository.js";
import type { UserRow } from "../../src/database/repositories/user.repository.js";
import { BillingService } from "../../src/billing/billing.service.js";
import type {
  BillingProvider,
  WebhookEvent,
} from "../../src/billing/billing-provider.js";

const CONFIG = { NODE_ENV: "test" } as AppConfig;

function makeService(
  events: WebhookEvent[],
  options: { failPlanUpdateOnce?: boolean; conflictOnRecord?: boolean } = {},
) {
  const subscriptions = new Map<string, BillingSubscriptionRow>();
  const recorded = new Map<string, BillingEventRow>();
  const users = new Map<string, UserRow>();
  const queue = [...events];
  const now = new Date();
  let planUpdateFailures = options.failPlanUpdateOnce ? 1 : 0;
  users.set("usr_one", {
    id: "usr_one",
    email: "one@example.com",
    passwordHash: "scrypt$test",
    planTier: "free",
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const repo = {
    async getSubscription(userId: string) {
      return subscriptions.get(userId) ?? null;
    },
    async findSubscriptionByExternalId(subscriptionId: string) {
      return (
        [...subscriptions.values()].find(
          (row) => row.subscriptionId === subscriptionId,
        ) ?? null
      );
    },
    async upsertSubscription(input: UpsertSubscriptionInput) {
      const existing = subscriptions.get(input.userId);
      const row: BillingSubscriptionRow = {
        id: existing?.id ?? input.id,
        userId: input.userId,
        plan: input.plan,
        status: input.status,
        provider: input.provider,
        customerId: input.customerId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
      };
      subscriptions.set(input.userId, row);
      return row;
    },
    async findEvent(idempotencyKey: string) {
      return recorded.get(idempotencyKey) ?? null;
    },
    async recordEvent(input: {
      id: string;
      userId?: string | null;
      provider: "stub" | "stripe";
      idempotencyKey: string;
      type: string;
      payload: Record<string, unknown>;
      processedAt: Date | null;
    }) {
      if (options.conflictOnRecord) return null;
      if (recorded.has(input.idempotencyKey)) return null;
      const row: BillingEventRow = {
        userId: input.userId ?? null,
        ...input,
        createdAt: new Date(),
      };
      recorded.set(input.idempotencyKey, row);
      return row;
    },
    async markEventProcessed(id: string, at: Date) {
      for (const row of recorded.values()) {
        if (row.id === id) row.processedAt = at;
      }
    },
  };

  const userRepo = {
    async findById(id: string) {
      return users.get(id) ?? null;
    },
    async updatePlanTier(id: string, planTier: "free" | "pro") {
      if (planUpdateFailures > 0) {
        planUpdateFailures -= 1;
        throw new Error("database temporarily unavailable");
      }
      const user = users.get(id);
      if (!user) return null;
      const updated = { ...user, planTier };
      users.set(id, updated);
      return updated;
    },
  };

  const provider: BillingProvider = {
    id: "stripe",
    checkoutCompletable: false,
    async createCheckout() {
      return { checkoutId: "cs_test", url: "https://checkout.example/cs_test" };
    },
    async createPortal() {
      return { url: "https://portal.example" };
    },
    async cancel() {},
    async parseWebhook() {
      return queue.shift() ?? null;
    },
  };

  const service = new BillingService(
    CONFIG,
    repo as never,
    userRepo as never,
    provider,
  );
  return { service, subscriptions, recorded, users };
}

describe("BillingService webhooks", () => {
  it("applies a checkout event once and ignores replays", async () => {
    const event: WebhookEvent = {
      id: "evt_1",
      type: "checkout.session.completed",
      payload: {
        data: {
          object: {
            client_reference_id: "usr_one",
            customer: "cus_1",
            subscription: "sub_1",
          },
        },
      },
    };
    const { service, subscriptions, recorded, users } = makeService([
      event,
      event,
    ]);

    const first = await service.webhook("{}", "sig");
    expect(first).toEqual({ received: true, processed: true });
    expect(subscriptions.get("usr_one")).toMatchObject({
      plan: "pro",
      status: "active",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
    expect(users.get("usr_one")?.planTier).toBe("pro");
    expect(recorded.get("evt_1")?.processedAt).not.toBeNull();

    const replay = await service.webhook("{}", "sig");
    expect(replay).toEqual({ received: true, processed: false });
  });

  it("downgrades on a past_due subscription update", async () => {
    const { service, subscriptions } = makeService([
      {
        id: "evt_checkout",
        type: "checkout.session.completed",
        payload: {
          data: {
            object: {
              client_reference_id: "usr_one",
              customer: "cus_1",
              subscription: "sub_1",
            },
          },
        },
      },
      {
        id: "evt_updated",
        type: "customer.subscription.updated",
        payload: {
          data: {
            object: {
              id: "sub_1",
              status: "past_due",
              cancel_at_period_end: false,
              current_period_end: 2_000_000_000,
            },
          },
        },
      },
    ]);

    await service.webhook("{}", "sig");
    await service.webhook("{}", "sig");

    expect(subscriptions.get("usr_one")).toMatchObject({
      status: "past_due",
      cancelAtPeriodEnd: false,
    });
  });

  it("rejects an unsigned webhook", async () => {
    const { service } = makeService([]);
    await expect(service.webhook("{}", undefined)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reason: "webhook_invalid" },
    });
  });

  it("retries an event that failed while applying the plan", async () => {
    const event: WebhookEvent = {
      id: "evt_retry",
      type: "checkout.session.completed",
      payload: {
        data: { object: { client_reference_id: "usr_one" } },
      },
    };
    const { service, recorded, users } = makeService([event, event], {
      failPlanUpdateOnce: true,
    });

    await expect(service.webhook("{}", "sig")).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(recorded.get("evt_retry")?.processedAt).toBeNull();
    expect(users.get("usr_one")?.planTier).toBe("free");

    const retry = await service.webhook("{}", "sig");
    expect(retry).toEqual({ received: true, processed: true });
    expect(recorded.get("evt_retry")?.processedAt).not.toBeNull();
    expect(users.get("usr_one")?.planTier).toBe("pro");
  });

  it("acknowledges a duplicate insert without double processing", async () => {
    const { service } = makeService(
      [
        {
          id: "evt_race",
          type: "checkout.session.completed",
          payload: { data: { object: { client_reference_id: "usr_one" } } },
        },
      ],
      { conflictOnRecord: true },
    );

    expect(await service.webhook("{}", "sig")).toEqual({
      received: true,
      processed: false,
    });
  });
});
