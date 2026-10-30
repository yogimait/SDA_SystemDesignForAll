/**
 * Checkout target resolution: the backend returns either a Stripe-hosted URL
 * or a local stub checkout path (`<APP_BASE_URL>/billing/checkout/<id>`).
 * Keeping this pure makes the branch testable without a browser.
 */
import type { CheckoutResponse } from "@sda/contracts";

export type CheckoutTarget =
  | { kind: "external"; url: string }
  | { kind: "internal"; url: string };

export function checkoutTarget(
  response: Pick<CheckoutResponse, "url">,
  appOrigin: string,
): CheckoutTarget {
  try {
    const target = new URL(response.url, appOrigin);
    if (target.origin === new URL(appOrigin).origin) {
      return { kind: "internal", url: `${target.pathname}${target.search}` };
    }
    return { kind: "external", url: target.toString() };
  } catch {
    return { kind: "external", url: response.url };
  }
}

/** Stub completion route for one checkout session. */
export function completeCheckoutPath(checkoutId: string): string {
  return `/api/billing/checkout/${encodeURIComponent(checkoutId)}/complete`;
}
