import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import type { GroqProvider } from "../../src/providers/groq/groq.provider.js";
import type { MockProvider } from "../../src/providers/mock/mock.provider.js";
import type { ModelProvider } from "../../src/providers/model-provider.js";
import type { OpenRouterProvider } from "../../src/providers/openrouter/openrouter.provider.js";
import { ProviderRegistry } from "../../src/providers/provider.registry.js";

const BASE_CONFIG = {
  NODE_ENV: "development",
  MOCK_PROVIDER: false,
  DEFAULT_PROVIDER: "openrouter",
  DEFAULT_MODEL: "test/model",
  OPENROUTER_MODELS: ["test/openrouter-model", "test/openrouter-alt"],
  GROQ_MODELS: ["test/groq-model"],
  OPENROUTER_API_KEY: undefined,
  GROQ_API_KEY: undefined,
} as AppConfig;

function makeRegistry(overrides: Partial<AppConfig> = {}) {
  const openrouterKeys: string[] = [];
  const groqKeys: string[] = [];
  const openrouterProvider = { id: "openrouter" } as ModelProvider;
  const groqProvider = { id: "groq" } as ModelProvider;
  const openrouter = {
    bind: (key: string) => {
      openrouterKeys.push(key);
      return openrouterProvider;
    },
  } as unknown as OpenRouterProvider;
  const groq = {
    bind: (key: string) => {
      groqKeys.push(key);
      return groqProvider;
    },
  } as unknown as GroqProvider;
  const mock = { id: "mock" } as unknown as MockProvider;
  const registry = new ProviderRegistry(
    { ...BASE_CONFIG, ...overrides },
    openrouter,
    groq,
    mock,
  );
  return { registry, openrouterKeys, groqKeys, openrouterProvider, groqProvider };
}

describe("ProviderRegistry key resolution", () => {
  it("falls back to the local env key when the header is missing", () => {
    const { registry, openrouterKeys, openrouterProvider } = makeRegistry({
      OPENROUTER_API_KEY: "sk-local-env",
    });

    expect(registry.resolve("openrouter")).toBe(openrouterProvider);
    expect(openrouterKeys).toEqual(["sk-local-env"]);
  });

  it("prefers the request header over the local env key", () => {
    const { registry, openrouterKeys } = makeRegistry({
      OPENROUTER_API_KEY: "sk-local-env",
    });

    registry.resolve("openrouter", "sk-from-header");
    expect(openrouterKeys).toEqual(["sk-from-header"]);
  });

  it("resolves Groq with its own env key", () => {
    const { registry, groqKeys, groqProvider } = makeRegistry({
      GROQ_API_KEY: "gsk-local-env",
    });

    expect(registry.resolve("groq")).toBe(groqProvider);
    expect(groqKeys).toEqual(["gsk-local-env"]);
  });

  it("ignores local env keys when NODE_ENV=production", () => {
    const { registry } = makeRegistry({
      NODE_ENV: "production",
      OPENROUTER_API_KEY: "sk-local-env",
      GROQ_API_KEY: "gsk-local-env",
    });

    expect(() => registry.resolve("openrouter")).toThrow(/API key/);
    expect(() => registry.resolve("groq")).toThrow(/API key/);
  });
});

describe("ProviderRegistry catalog", () => {
  it("lists both providers with their configured model catalogs", () => {
    const { registry } = makeRegistry();

    expect(registry.list()).toEqual([
      {
        id: "openrouter",
        models: ["test/openrouter-model", "test/openrouter-alt"],
        supportsStructuredOutput: true,
      },
      {
        id: "groq",
        models: ["test/groq-model"],
        supportsStructuredOutput: true,
      },
    ]);
  });

  it("keeps both catalogs in mock mode", () => {
    const { registry } = makeRegistry({ MOCK_PROVIDER: true });

    expect(registry.mockEnabled).toBe(true);
    expect(registry.list().map((provider) => provider.id)).toEqual([
      "openrouter",
      "groq",
    ]);
    expect(registry.list().every((provider) => provider.models.length > 0)).toBe(
      true,
    );
  });
});
