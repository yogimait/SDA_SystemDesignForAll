import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { StripeBillingProvider } from "../../src/billing/stripe-billing.provider.js";

function config(): AppConfig {
  return {
    NODE_ENV: "test",
    APP_BASE_URL: "https://sda.example",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_PRO: "price_pro",
  } as AppConfig;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBody(init?: RequestInit): URLSearchParams {
  if (init?.body instanceof URLSearchParams) return init.body;
  return new URLSearchParams(
    typeof init?.body === "string" ? init.body : "",
  );
}

describe("StripeBillingProvider", () => {
  it("uses real frontend completion routes for checkout", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new StripeBillingProvider(config(), async (url, init) => {
      calls.push({ url: requestUrl(url), init: init ?? {} });
      return jsonResponse({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
    });

    await provider.createCheckout({
      user: { id: "usr_1", email: "one@example.com" } as never,
      plan: "pro",
    });

    expect(calls[0]?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const body = requestBody(calls[0]?.init);
    expect(body.get("success_url")).toBe("https://sda.example/billing/success");
    expect(body.get("cancel_url")).toBe("https://sda.example/billing/cancel");
    expect(body.get("client_reference_id")).toBe("usr_1");
    expect(body.get("line_items[0][price]")).toBe("price_pro");
  });

  it("returns to settings from the billing portal", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new StripeBillingProvider(config(), async (url, init) => {
      calls.push({ url: requestUrl(url), init: init ?? {} });
      return jsonResponse({ url: "https://billing.stripe.test/portal" });
    });

    await provider.createPortal(
      { id: "usr_1", email: "one@example.com" } as never,
      { customerId: "cus_1" } as never,
    );

    const body = requestBody(calls[0]?.init);
    expect(body.get("return_url")).toBe("https://sda.example/settings");
  });

  it("verifies the Stripe webhook signature", async () => {
    const provider = new StripeBillingProvider(config(), async () =>
      jsonResponse({}),
    );
    const rawBody = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");

    await expect(
      provider.parseWebhook({
        rawBody,
        signature: `t=${timestamp},v1=${signature}`,
      }),
    ).resolves.toMatchObject({ id: "evt_1", type: "checkout.session.completed" });

    await expect(
      provider.parseWebhook({ rawBody, signature: "t=1,v1=deadbeef" }),
    ).resolves.toBeNull();
  });
});
