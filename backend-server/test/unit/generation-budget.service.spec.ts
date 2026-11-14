import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { GenerationBudgetService } from "../../src/generation/generation-budget.service.js";

const CONFIG = {
  GENERATION_ENABLED: true,
  GLOBAL_DAILY_RUN_LIMIT: 10,
  GLOBAL_DAILY_TOKEN_LIMIT: 1_000,
} as AppConfig;

function makeService(usage = {
  runCount: 0,
  promptTokens: 0,
  completionTokens: 0,
}) {
  const analytics = {
    sumGlobalUsageSince: vi.fn(async () => usage),
  };
  return {
    service: new GenerationBudgetService(CONFIG, analytics as never),
    analytics,
  };
}

describe("GenerationBudgetService", () => {
  it("blocks generation when the kill switch is off", async () => {
    const service = new GenerationBudgetService(
      { ...CONFIG, GENERATION_ENABLED: false } as AppConfig,
      {} as never,
    );

    await expect(service.assertCanStart()).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      details: { reason: "generation_disabled" },
    });
  });

  it("blocks the global daily run limit", async () => {
    const { service } = makeService({
      runCount: 10,
      promptTokens: 0,
      completionTokens: 0,
    });

    await expect(service.assertCanStart()).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      details: { reason: "global_daily_run_limit", limit: 10 },
    });
  });

  it("blocks the global daily token budget", async () => {
    const { service } = makeService({
      runCount: 1,
      promptTokens: 600,
      completionTokens: 400,
    });

    await expect(service.assertCanStart()).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      details: { reason: "global_daily_token_limit", limit: 1_000 },
    });
  });

  it("allows a run under both limits", async () => {
    const { service, analytics } = makeService({
      runCount: 2,
      promptTokens: 200,
      completionTokens: 100,
    });

    await expect(service.assertCanStart()).resolves.toBeUndefined();
    expect(analytics.sumGlobalUsageSince).toHaveBeenCalledOnce();
  });
});
