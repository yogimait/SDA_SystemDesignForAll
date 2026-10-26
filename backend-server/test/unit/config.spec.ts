import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config).toMatchObject({
      NODE_ENV: "development",
      PORT: 3001,
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_DRIVER: "pglite",
      PGLITE_DATA_DIR: ".data/pglite",
      MOCK_PROVIDER: false,
      DEFAULT_PROVIDER: "openrouter",
      DEFAULT_MODEL: "z-ai/glm-5.3-flash",
      OPENROUTER_REASONING_EFFORT: "low",
    });
  });

  it("coerces numbers and boolean flags", () => {
    const config = loadConfig({
      PORT: "4000",
      MOCK_PROVIDER: "true",
      GENERATION_POLL_INTERVAL_MS: "25",
      THROTTLE_LIMIT: "5",
    } as NodeJS.ProcessEnv);
    expect(config.PORT).toBe(4000);
    expect(config.MOCK_PROVIDER).toBe(true);
    expect(config.GENERATION_POLL_INTERVAL_MS).toBe(25);
    expect(config.THROTTLE_LIMIT).toBe(5);
  });

  it("loads a local OpenRouter key and treats a blank value as unset", () => {
    const config = loadConfig({
      OPENROUTER_API_KEY: " sk-local-test ",
    } as NodeJS.ProcessEnv);
    expect(config.OPENROUTER_API_KEY).toBe("sk-local-test");
    expect(
      loadConfig({ OPENROUTER_API_KEY: "" } as NodeJS.ProcessEnv)
        .OPENROUTER_API_KEY,
    ).toBeUndefined();
  });

  it("fails fast on an invalid port", () => {
    expect(() =>
      loadConfig({ PORT: "0" } as NodeJS.ProcessEnv),
    ).toThrow(/PORT/);
  });

  it("requires DATABASE_URL for the postgres driver", () => {
    expect(() =>
      loadConfig({ DATABASE_DRIVER: "postgres" } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() =>
      loadConfig({
        DATABASE_DRIVER: "postgres",
        DATABASE_URL: "not-a-url",
      } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });
});
