import { describe, expect, it } from "vitest";
import { checkoutTarget, completeCheckoutPath } from "./checkout";

const APP = "http://localhost:3000";

describe("checkout target", () => {
  it("keeps a same-origin stub checkout internal (no full reload)", () => {
    expect(
      checkoutTarget({ url: "http://localhost:3000/billing/checkout/chk_1" }, APP),
    ).toEqual({ kind: "internal", url: "/billing/checkout/chk_1" });
  });

  it("sends a Stripe-hosted checkout to the external URL", () => {
    expect(
      checkoutTarget({ url: "https://checkout.stripe.com/c/pay/cs_test_123" }, APP),
    ).toEqual({ kind: "external", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
  });

  it("resolves a relative stub URL against the app origin", () => {
    expect(checkoutTarget({ url: "/billing/checkout/chk_2" }, APP)).toEqual({
      kind: "internal",
      url: "/billing/checkout/chk_2",
    });
  });

  it("rejects a non-http redirect scheme", () => {
    expect(checkoutTarget({ url: "javascript:alert(1)" }, APP)).toEqual({
      kind: "invalid",
    });
    expect(checkoutTarget({ url: "data:text/html,checkout" }, APP)).toEqual({
      kind: "invalid",
    });
  });

  it("refuses to navigate when the app origin is unusable", () => {
    expect(checkoutTarget({ url: "/billing/checkout/chk_3" }, "::::")).toEqual({
      kind: "invalid",
    });
  });

  it("encodes the checkout id in the completion path", () => {
    expect(completeCheckoutPath("chk 1/x")).toBe("/api/billing/checkout/chk%201%2Fx/complete");
  });
});
