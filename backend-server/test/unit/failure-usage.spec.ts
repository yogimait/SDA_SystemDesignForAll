import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { failureUsage } from "../../src/generation/failure-usage.js";

describe("failureUsage", () => {
  it("reads usage attached directly to the error details", () => {
    const error = new AppError("INVALID_MODEL_OUTPUT", "truncated", {
      reason: "truncated_output",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
    expect(failureUsage(error)).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it("reads usage nested under providerOutput after repair exhaustion", () => {
    const error = new AppError("GENERATION_REPAIR_FAILED", "failed", {
      stage: "hld_model",
      providerOutput: {
        usage: { promptTokens: 100, completionTokens: 64_000 },
      },
    });
    expect(failureUsage(error)).toEqual({
      promptTokens: 100,
      completionTokens: 64_000,
      totalTokens: 64_100,
    });
  });

  it("ignores non-errors and details without usage", () => {
    expect(failureUsage(new Error("plain"))).toBeUndefined();
    expect(
      failureUsage(new AppError("PROVIDER_TIMEOUT", "timeout", {})),
    ).toBeUndefined();
  });
});
