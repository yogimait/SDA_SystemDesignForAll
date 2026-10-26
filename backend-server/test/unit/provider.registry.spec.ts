import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import type { MockProvider } from "../../src/providers/mock/mock.provider.js";
import type { ModelProvider } from "../../src/providers/model-provider.js";
import type { OpenRouterProvider } from "../../src/providers/openrouter/openrouter.provider.js";
import { ProviderRegistry } from "../../src/providers/provider.registry.js";

const BASE_CONFIG = {
  NODE_ENV: "development",
  MOCK_PROVIDER: false,
  DEFAULT_PROVIDER: "openrouter",
  DEFAULT_MODEL: "test/model",
  OPENROUTER_API_KEY: undefined,
} as AppConfig;

function makeRegistry(overrides: Partial<AppConfig> = {}) {
  const boundKeys: string[] = [];
  const provider = { id: "openrouter" } as ModelProvider;
  const openrouter = {
    bind: (key: string) => {
      boundKeys.push(key);
      return provider;
    },
  } as unknown as OpenRouterProvider;
  const mock = { id: "mock" } as unknown as MockProvider;
  const registry = new ProviderRegistry(
    { ...BASE_CONFIG, ...overrides },
    openrouter,
    mock,
  );
  return { registry, boundKeys, provider };
}

describe("ProviderRegistry key resolution", () => {
  it("falls back to the local env key when the header is missing", () => {
    const { registry, boundKeys, provider } = makeRegistry({
      OPENROUTER_API_KEY: "sk-local-env",
    });

    expect(registry.resolve("openrouter")).toBe(provider);
    expect(boundKeys).toEqual(["sk-local-env"]);
  });

  it("prefers the request header over the local env key", () => {
    const { registry, boundKeys } = makeRegistry({
      OPENROUTER_API_KEY: "sk-local-env",
    });

    registry.resolve("openrouter", "sk-from-header");
    expect(boundKeys).toEqual(["sk-from-header"]);
  });

  it("ignores the local env key when NODE_ENV=production", () => {
    const { registry } = makeRegistry({
      NODE_ENV: "production",
      OPENROUTER_API_KEY: "sk-local-env",
    });

    expect(() => registry.resolve("openrouter")).toThrow(/API key/);
  });
});
