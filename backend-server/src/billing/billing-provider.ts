import type { PlanTier } from "@sda/contracts";
import type { UserRow } from "../database/repositories/user.repository.js";
import type { BillingSubscriptionRow } from "../database/repositories/billing.repository.js";

export interface CheckoutSession {
  checkoutId: string;
  url: string;
}

export interface WebhookEvent {
  /** Provider event id; the idempotency key. */
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface CheckoutInput {
  user: UserRow;
  plan: PlanTier;
}

/**
 * External payment boundary. `stub` is local development only; `stripe` is
 * used when STRIPE_SECRET_KEY is set. Nothing here ever charges a card in
 * development, and secrets never reach logs or API responses.
 */
export interface BillingProvider {
  readonly id: "stub" | "stripe";
  /** Only the stub can finish a checkout through our own endpoint. */
  readonly checkoutCompletable: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  createPortal(
    user: UserRow,
    subscription: BillingSubscriptionRow | null,
  ): Promise<{ url: string }>;
  cancel(subscription: BillingSubscriptionRow | null): Promise<void>;
  /** Stub only: consumes the local checkout session. */
  completeCheckout?(checkoutId: string, userId: string): Promise<void>;
  parseWebhook(input: {
    rawBody: string;
    signature: string | undefined;
  }): Promise<WebhookEvent | null>;
}

export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER");
export const STRIPE_FETCH = Symbol("STRIPE_FETCH");
