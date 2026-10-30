import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRow } from "../database/repositories/user.repository.js";
import type { BillingSubscriptionRow } from "../database/repositories/billing.repository.js";
import { AppError } from "../common/errors/app-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  STRIPE_FETCH,
  type BillingProvider,
  type CheckoutInput,
  type CheckoutSession,
  type WebhookEvent,
} from "./billing-provider.js";

const STRIPE_API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Stripe over plain REST + fetch: no SDK dependency. Webhook signatures are
 * verified with HMAC-SHA256 over `<timestamp>.<raw body>`.
 */
@Injectable()
export class StripeBillingProvider implements BillingProvider {
  readonly id = "stripe" as const;
  readonly checkoutCompletable = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STRIPE_FETCH) private readonly fetchFn: typeof fetch,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const price = this.config.STRIPE_PRICE_PRO;
    if (!price) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Stripe is configured without STRIPE_PRICE_PRO, so checkout is unavailable.",
      );
    }
    const base = this.config.APP_BASE_URL.replace(/\/$/, "");
    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${base}/billing?status=success`,
      cancel_url: `${base}/billing?status=cancelled`,
      client_reference_id: input.user.id,
      customer_email: input.user.email,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
    });
    const session = await this.request("/checkout/sessions", body);
    if (typeof session.id !== "string" || typeof session.url !== "string") {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The billing provider returned an unexpected checkout response.",
      );
    }
    return { checkoutId: session.id, url: session.url };
  }

  async createPortal(
    _user: UserRow,
    subscription: BillingSubscriptionRow | null,
  ): Promise<{ url: string }> {
    if (!subscription?.customerId) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "No billing customer exists for this account yet.",
      );
    }
    const base = this.config.APP_BASE_URL.replace(/\/$/, "");
    const portal = await this.request(
      "/billing_portal/sessions",
      new URLSearchParams({
        customer: subscription.customerId,
        return_url: `${base}/account/billing`,
      }),
    );
    if (typeof portal.url !== "string") {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The billing provider returned an unexpected portal response.",
      );
    }
    return { url: portal.url };
  }

  async cancel(subscription: BillingSubscriptionRow | null): Promise<void> {
    if (!subscription?.subscriptionId) return;
    await this.request(
      `/subscriptions/${encodeURIComponent(subscription.subscriptionId)}`,
      new URLSearchParams({ cancel_at_period_end: "true" }),
    );
  }

  async parseWebhook(input: {
    rawBody: string;
    signature: string | undefined;
  }): Promise<WebhookEvent | null> {
    if (!this.verifySignature(input.rawBody, input.signature)) return null;
    try {
      const parsed = JSON.parse(input.rawBody) as {
        id?: unknown;
        type?: unknown;
      };
      if (typeof parsed.id !== "string" || typeof parsed.type !== "string") {
        return null;
      }
      return {
        id: parsed.id,
        type: parsed.type,
        payload: parsed as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private verifySignature(
    rawBody: string,
    header: string | undefined,
  ): boolean {
    const secret = this.config.STRIPE_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    let timestamp: string | undefined;
    const signatures: string[] = [];
    for (const part of header.split(",")) {
      const separator = part.indexOf("=");
      if (separator === -1) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key === "t") timestamp = value;
      if (key === "v1") signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) return false;
    const age = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_MS) return false;
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    return signatures.some((signature) => safeHexEqual(signature, expected));
  }

  private async request(
    path: string,
    body: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const key = this.config.STRIPE_SECRET_KEY;
    if (!key) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Billing is not configured on this deployment.",
      );
    }
    const response = await this.fetchFn(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The billing provider rejected the request.",
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }
}

function safeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
