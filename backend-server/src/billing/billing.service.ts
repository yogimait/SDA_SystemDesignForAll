import { Inject, Injectable } from "@nestjs/common";
import {
  PLAN_CATALOG,
  type BillingPlansResponse,
  type BillingPortalResponse,
  type BillingSubscriptionResponse,
  type CheckoutResponse,
  type BillingWebhookResponse,
  type PlanTier,
  type SubscriptionStatus,
} from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  BILLING_REPOSITORY,
  type BillingRepository,
  type BillingSubscriptionRow,
} from "../database/repositories/billing.repository.js";
import {
  USER_REPOSITORY,
  type UserRepository,
  type UserRow,
} from "../database/repositories/user.repository.js";
import {
  BILLING_PROVIDER,
  type BillingProvider,
  type WebhookEvent,
} from "./billing-provider.js";

const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  plans(): BillingPlansResponse {
    return {
      plans: [...PLAN_CATALOG],
      provider: this.provider.id,
      checkoutCompletable: this.provider.checkoutCompletable && this.checkoutEnabled,
    };
  }

  async subscription(user: UserRow): Promise<BillingSubscriptionResponse> {
    const row = await this.billing.getSubscription(user.id);
    return { subscription: row ? toSubscriptionDto(row) : null, planTier: user.planTier };
  }

  async checkout(user: UserRow, plan: PlanTier): Promise<CheckoutResponse> {
    if (!this.checkoutEnabled) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Billing is not configured on this deployment.",
      );
    }
    const session = await this.provider.createCheckout({ user, plan });
    return {
      checkoutId: session.checkoutId,
      url: session.url,
      provider: this.provider.id,
    };
  }

  /** Stub only: hidden outside non-production deployments. */
  async completeCheckout(
    user: UserRow,
    checkoutId: string,
  ): Promise<BillingSubscriptionResponse> {
    if (this.config.NODE_ENV === "production" || !this.provider.completeCheckout) {
      throw new AppError("ROUTE_NOT_FOUND");
    }
    await this.provider.completeCheckout(checkoutId, user.id);
    const now = new Date();
    await this.savePlan(user.id, "pro", {
      status: "active",
      customerId: null,
      subscriptionId: null,
      currentPeriodEnd: new Date(now.getTime() + SUBSCRIPTION_PERIOD_MS),
      cancelAtPeriodEnd: false,
      now,
    });
    const refreshed = await this.users.findById(user.id);
    return this.subscription(refreshed ?? { ...user, planTier: "pro" });
  }

  async portal(user: UserRow): Promise<BillingPortalResponse> {
    const subscription = await this.billing.getSubscription(user.id);
    return this.provider.createPortal(user, subscription);
  }

  async cancel(user: UserRow): Promise<BillingSubscriptionResponse> {
    const existing = await this.billing.getSubscription(user.id);
    if (!existing) {
      return { subscription: null, planTier: user.planTier };
    }
    await this.provider.cancel(existing);
    const now = new Date();
    // The stub has no external lifecycle, so cancellation takes effect now.
    const cancelImmediately = this.provider.id === "stub";
    await this.billing.upsertSubscription({
      id: existing.id,
      userId: user.id,
      plan: existing.plan,
      status: cancelImmediately ? "canceled" : existing.status,
      provider: existing.provider,
      customerId: existing.customerId,
      subscriptionId: existing.subscriptionId,
      currentPeriodEnd: existing.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      now,
    });
    if (cancelImmediately) {
      await this.users.updatePlanTier(user.id, "free");
    }
    const row = await this.billing.getSubscription(user.id);
    const refreshed = await this.users.findById(user.id);
    return {
      subscription: row ? toSubscriptionDto(row) : null,
      planTier: refreshed?.planTier ?? user.planTier,
    };
  }

  async webhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<BillingWebhookResponse> {
    const event = await this.provider.parseWebhook({ rawBody, signature });
    if (!event) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The webhook signature or payload is invalid.",
        { reason: "webhook_invalid" },
      );
    }
    const existing = await this.billing.findEvent(event.id);
    if (existing?.processedAt) {
      return { received: true, processed: false };
    }
    if (existing) {
      // A previous attempt recorded the event but failed before processing.
      await this.processEvent(existing.id, event);
      return { received: true, processed: true };
    }
    const record = await this.billing.recordEvent({
      id: randomUUID(),
      userId: eventUserId(event),
      provider: this.provider.id,
      idempotencyKey: event.id,
      type: event.type,
      payload: event.payload,
      processedAt: null,
    });
    if (!record) {
      // Concurrent delivery inserted the same event first.
      return { received: true, processed: false };
    }
    await this.processEvent(record.id, event);
    return { received: true, processed: true };
  }

  /** Processing happens before the event is marked done, so a crash retries. */
  private async processEvent(id: string, event: WebhookEvent): Promise<void> {
    await this.handleEvent(event);
    await this.billing.markEventProcessed(id, new Date());
  }

  private get checkoutEnabled(): boolean {
    // The stub has no completion route in production, so never advertise it.
    return !(this.config.NODE_ENV === "production" && this.provider.id === "stub");
  }

  private async handleEvent(event: WebhookEvent): Promise<void> {
    const object = stripeObject(event.payload);
    if (event.type === "checkout.session.completed") {
      const userId = stringField(object, "client_reference_id");
      if (!userId) return;
      await this.savePlan(userId, "pro", {
        status: "active",
        customerId: stringField(object, "customer") ?? null,
        subscriptionId: stringField(object, "subscription") ?? null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        now: new Date(),
      });
      return;
    }
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscriptionId = stringField(object, "id");
      if (!subscriptionId) return;
      const existing =
        await this.billing.findSubscriptionByExternalId(subscriptionId);
      if (!existing) return;
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscriptionStatus(stringField(object, "status"));
      const tier: PlanTier =
        status === "active" || status === "trialing" ? existing.plan : "free";
      await this.billing.upsertSubscription({
        id: existing.id,
        userId: existing.userId,
        plan: existing.plan,
        status,
        provider: "stripe",
        customerId: existing.customerId,
        subscriptionId,
        currentPeriodEnd:
          epochSecondsToDate(object.current_period_end) ??
          existing.currentPeriodEnd,
        cancelAtPeriodEnd:
          booleanField(object, "cancel_at_period_end") ?? false,
        now: new Date(),
      });
      await this.users.updatePlanTier(existing.userId, tier);
    }
  }

  private async savePlan(
    userId: string,
    plan: PlanTier,
    input: {
      status: SubscriptionStatus;
      customerId: string | null;
      subscriptionId: string | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      now: Date;
    },
  ): Promise<void> {
    const existing = await this.billing.getSubscription(userId);
    await this.billing.upsertSubscription({
      id: existing?.id ?? randomUUID(),
      userId,
      plan,
      status: input.status,
      provider: this.provider.id,
      customerId: input.customerId,
      subscriptionId: input.subscriptionId,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      now: input.now,
    });
    await this.users.updatePlanTier(userId, plan);
  }
}

function toSubscriptionDto(row: BillingSubscriptionRow) {
  return {
    plan: row.plan,
    status: row.status,
    provider: row.provider,
    currentPeriodEnd: row.currentPeriodEnd
      ? row.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function eventUserId(event: WebhookEvent): string | null {
  if (event.type !== "checkout.session.completed") return null;
  return stringField(stripeObject(event.payload), "client_reference_id") ?? null;
}

function stripeObject(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (!data || typeof data !== "object") return {};
  const object = (data as { object?: unknown }).object;
  return object && typeof object === "object"
    ? (object as Record<string, unknown>)
    : {};
}

function stringField(
  object: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanField(
  object: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = object[key];
  return typeof value === "boolean" ? value : undefined;
}

function epochSecondsToDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000);
}

function subscriptionStatus(value: string | undefined): SubscriptionStatus {
  switch (value) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
      return value;
    default:
      return "incomplete";
  }
}
