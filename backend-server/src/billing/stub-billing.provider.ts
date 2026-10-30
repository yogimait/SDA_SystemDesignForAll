import { Inject, Injectable } from "@nestjs/common";
import type { PlanTier } from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import type { BillingSubscriptionRow } from "../database/repositories/billing.repository.js";
import type { UserRow } from "../database/repositories/user.repository.js";
import type {
  BillingProvider,
  CheckoutInput,
  CheckoutSession,
  WebhookEvent,
} from "./billing-provider.js";

/**
 * Local development provider: records a checkout id in memory and lets the
 * dev-only complete endpoint upgrade the plan. No card is charged and no
 * external request leaves the process.
 */
@Injectable()
export class StubBillingProvider implements BillingProvider {
  readonly id = "stub" as const;
  readonly checkoutCompletable = true;
  private readonly sessions = new Map<string, { userId: string; plan: PlanTier }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const checkoutId = randomUUID();
    this.sessions.set(checkoutId, {
      userId: input.user.id,
      plan: input.plan,
    });
    return {
      checkoutId,
      url: `${this.baseUrl()}/billing/checkout/${checkoutId}`,
    };
  }

  async completeCheckout(checkoutId: string, userId: string): Promise<void> {
    const session = this.sessions.get(checkoutId);
    if (!session || session.userId !== userId) {
      throw new AppError("ROUTE_NOT_FOUND");
    }
    this.sessions.delete(checkoutId);
  }

  async createPortal(
    _user: UserRow,
    _subscription: BillingSubscriptionRow | null,
  ): Promise<{ url: string }> {
    return { url: `${this.baseUrl()}/account/billing` };
  }

  async cancel(_subscription: BillingSubscriptionRow | null): Promise<void> {
    // Nothing external to cancel; the service updates local state.
  }

  async parseWebhook(_input: {
    rawBody: string;
    signature: string | undefined;
  }): Promise<WebhookEvent | null> {
    return null;
  }

  private baseUrl(): string {
    return this.config.APP_BASE_URL.replace(/\/$/, "");
  }
}
