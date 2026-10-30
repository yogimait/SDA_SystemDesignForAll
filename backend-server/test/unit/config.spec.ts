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
      OPENROUTER_MODELS: [
        "z-ai/glm-5.3-flash",
        "anthropic/claude-sonnet-4.5",
        "openai/gpt-5",
        "google/gemini-2.5-pro",
        "deepseek/deepseek-chat",
      ],
      GROQ_MODELS: [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
      ],
      OPENROUTER_REASONING_EFFORT: "low",
      GROQ_REASONING_EFFORT: "low",
      ACCESS_TOKEN_TTL: 15 * 60 * 1000,
      REFRESH_TOKEN_TTL: 30 * 24 * 60 * 60 * 1000,
      REQUIRE_EMAIL_VERIFICATION: false,
      APP_BASE_URL: "http://localhost:3000",
      AUTH_THROTTLE_LIMIT: 5,
      AUTH_THROTTLE_TTL_MS: 60_000,
    });
    expect(config.CSRF_SECRET).toBeUndefined();
    expect(config.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("parses token durations and rejects malformed ones", () => {
    const config = loadConfig({
      ACCESS_TOKEN_TTL: "45m",
      REFRESH_TOKEN_TTL: "14d",
      REQUIRE_EMAIL_VERIFICATION: "1",
    } as NodeJS.ProcessEnv);
    expect(config.ACCESS_TOKEN_TTL).toBe(45 * 60 * 1000);
    expect(config.REFRESH_TOKEN_TTL).toBe(14 * 24 * 60 * 60 * 1000);
    expect(config.REQUIRE_EMAIL_VERIFICATION).toBe(true);

    expect(() =>
      loadConfig({ ACCESS_TOKEN_TTL: "15" } as NodeJS.ProcessEnv),
    ).toThrow(/ACCESS_TOKEN_TTL/);
    expect(() =>
      loadConfig({ ACCESS_TOKEN_TTL: "0s" } as NodeJS.ProcessEnv),
    ).toThrow(/ACCESS_TOKEN_TTL/);
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

  it("parses comma-separated provider model catalogs", () => {
    const config = loadConfig({
      OPENROUTER_MODELS: " a/one , b/two ,, a/one ",
      GROQ_MODELS: "openai/gpt-oss-20b",
    } as NodeJS.ProcessEnv);
    expect(config.OPENROUTER_MODELS).toEqual(["a/one", "b/two"]);
    expect(config.GROQ_MODELS).toEqual(["openai/gpt-oss-20b"]);
  });

  it("rejects an empty model catalog", () => {
    expect(() =>
      loadConfig({ GROQ_MODELS: " , " } as NodeJS.ProcessEnv),
    ).toThrow(/GROQ_MODELS/);
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
