/**
 * Checkout target resolution: the backend returns either a Stripe-hosted URL
 * or a local stub checkout path (`<APP_BASE_URL>/billing/checkout/<id>`).
 * Keeping this pure makes the branch testable without a browser.
 *
 * The URL is server-provided, so only http(s) may ever be navigated to:
 * `javascript:`, `data:` and malformed values resolve to `invalid` and the
 * caller refuses the redirect.
 */
import type { CheckoutResponse } from "@sda/contracts";

export type CheckoutTarget =
  | { kind: "external"; url: string }
  | { kind: "internal"; url: string }
  | { kind: "invalid" };

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function checkoutTarget(
  response: Pick<CheckoutResponse, "url">,
  appOrigin: string,
): CheckoutTarget {
  try {
    const appUrl = new URL(appOrigin);
    const target = new URL(response.url, appUrl);
    if (!SAFE_PROTOCOLS.has(target.protocol)) {
      return { kind: "invalid" };
    }
    if (target.origin === appUrl.origin) {
      return { kind: "internal", url: `${target.pathname}${target.search}` };
    }
    return { kind: "external", url: target.toString() };
  } catch {
    return { kind: "invalid" };
  }
}

/** Stub completion route for one checkout session. */
export function completeCheckoutPath(checkoutId: string): string {
  return `/api/billing/checkout/${encodeURIComponent(checkoutId)}/complete`;
}
