import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { AUTH_RATE_LIMITED_MESSAGE, authRateLimitCopy } from "./messages";

const apiError = (code: ApiError["code"]) =>
  new ApiError(code, { userMessage: "Generation limit reached." });

describe("auth rate-limit copy", () => {
  it("maps QUOTA_EXCEEDED to neutral auth copy", () => {
    expect(authRateLimitCopy(apiError("QUOTA_EXCEEDED"))).toBe(
      AUTH_RATE_LIMITED_MESSAGE,
    );
    expect(AUTH_RATE_LIMITED_MESSAGE).not.toMatch(/generation/i);
  });

  it("leaves every other code to the shared message table", () => {
    expect(authRateLimitCopy(apiError("AUTH_INVALID_CREDENTIALS"))).toBeNull();
    expect(authRateLimitCopy(apiError("VALIDATION_ERROR"))).toBeNull();
    expect(authRateLimitCopy(new Error("boom"))).toBeNull();
  });
});
