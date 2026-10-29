import { describe, expect, it } from "vitest";
import { providerSetupMessage, providerSetupState } from "./setup";

const READY = {
  provider: "groq",
  apiKey: "gsk_0123456789abcdef",
  model: "openai/gpt-oss-120b",
};

describe("provider setup gating", () => {
  it("is ready only when provider, model, and key are all present", () => {
    expect(providerSetupState(READY)).toEqual({
      ready: true,
      gaps: [],
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
  });

  it("names every missing piece for an unset setup", () => {
    const state = providerSetupState(null);
    expect(state.ready).toBe(false);
    expect(state.gaps).toEqual(["provider", "model", "key"]);
    expect(providerSetupMessage(state)).toBe(
      "Nothing runs until you choose a provider, pick a model, add that provider's API key.",
    );
  });

  it("treats a too-short key as missing (dialog floor is 16 chars)", () => {
    const state = providerSetupState({ ...READY, apiKey: "short" });
    expect(state.ready).toBe(false);
    expect(state.gaps).toEqual(["key"]);
    expect(providerSetupMessage(state)).toBe(
      "Nothing runs until you add that provider's API key.",
    );
  });

  it("reports provider/model gaps independently", () => {
    expect(providerSetupState({ ...READY, provider: "  " }).gaps).toEqual(["provider"]);
    expect(providerSetupState({ ...READY, model: " " }).gaps).toEqual(["model"]);
  });
});
