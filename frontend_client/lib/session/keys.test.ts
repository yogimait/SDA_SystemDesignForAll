import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProviderSetup,
  consumePendingIdea,
  loadProjectAccessKey,
  loadProviderKeys,
  loadProviderSetup,
  peekPendingIdea,
  savePendingIdea,
  saveProjectAccessKey,
  saveProviderSetup,
} from "./keys";

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider setup storage", () => {
  it("round-trips provider, key and model through one namespaced entry", () => {
    saveProviderSetup({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "z-ai/glm-5.3-flash",
    });

    // exactly one entry, namespaced
    expect(window.sessionStorage.length).toBe(1);

    const setup = loadProviderSetup();
    expect(setup).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "z-ai/glm-5.3-flash",
    });
  });

  it("drops malformed or partial entries instead of trusting them", () => {
    window.sessionStorage.setItem("sda:provider-setup", "{ key: 1 }");
    expect(loadProviderSetup()).toBeNull();

    window.sessionStorage.setItem("sda:provider-setup", JSON.stringify({ apiKey: "x" }));
    expect(loadProviderSetup()).toBeNull();
  });

  it("clear removes the entry", () => {
    saveProviderSetup({ provider: "openrouter", apiKey: "k", model: "m" });
    clearProviderSetup();
    expect(loadProviderSetup()).toBeNull();
  });

  it("keeps one key per provider when switching back and forth", () => {
    saveProviderSetup({ provider: "openrouter", apiKey: "sk-or-one", model: "z-ai/glm-5.3-flash" });
    saveProviderSetup({ provider: "groq", apiKey: "gsk_two", model: "openai/gpt-oss-120b" });

    expect(loadProviderSetup()).toEqual({
      provider: "groq",
      apiKey: "gsk_two",
      model: "openai/gpt-oss-120b",
    });
    expect(loadProviderKeys()).toEqual({ openrouter: "sk-or-one", groq: "gsk_two" });

    // Switching back restores the other provider's key, not the active one.
    saveProviderSetup({ provider: "openrouter", apiKey: "sk-or-one", model: "z-ai/glm-5.3-flash" });
    expect(loadProviderSetup()?.apiKey).toBe("sk-or-one");
    expect(window.sessionStorage.length).toBe(1);
  });

  it("migrates the single-key entry shape", () => {
    window.sessionStorage.setItem(
      "sda:provider-setup",
      JSON.stringify({ provider: "openrouter", apiKey: "sk-or-old", model: "z-ai/glm-5.3-flash" }),
    );
    expect(loadProviderSetup()).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-old",
      model: "z-ai/glm-5.3-flash",
    });
    // Saving another provider keeps the migrated key.
    saveProviderSetup({ provider: "groq", apiKey: "gsk_two", model: "openai/gpt-oss-120b" });
    expect(loadProviderKeys()).toEqual({ openrouter: "sk-or-old", groq: "gsk_two" });
  });
});

describe("project access key storage", () => {
  it("stores and loads per-project access keys", () => {
    saveProjectAccessKey("p_1", "pk_abc");
    expect(loadProjectAccessKey("p_1")).toBe("pk_abc");
    expect(loadProjectAccessKey("p_2")).toBeNull();
  });
});

describe("pending idea storage (sign-in-and-continue)", () => {
  it("peek sees the idea without consuming it; consume clears the slot once", () => {
    savePendingIdea("Design a rate limiter");
    expect(peekPendingIdea()).toBe("Design a rate limiter");
    // peek is non-destructive
    expect(peekPendingIdea()).toBe("Design a rate limiter");

    expect(consumePendingIdea()).toBe("Design a rate limiter");
    expect(consumePendingIdea()).toBeNull();
    expect(peekPendingIdea()).toBeNull();
  });

  it("treats an empty slot as null", () => {
    savePendingIdea("");
    expect(peekPendingIdea()).toBeNull();
    expect(consumePendingIdea()).toBeNull();
  });
});
