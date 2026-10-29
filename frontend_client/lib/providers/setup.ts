/**
 * Provider-setup gating rules (single source for the dialog guard and the
 * requirements page). A run needs all three: a provider, one of that
 * provider's models, and that provider's own key in this tab.
 */
import type { ProviderSetup } from "@/lib/session/keys";

/** Same floor the provider dialog enforces (a pasted key, not a stub). */
export const MIN_PROVIDER_KEY_LENGTH = 16;

export type ProviderSetupGap = "provider" | "model" | "key";

export type ProviderSetupState = {
  ready: boolean;
  gaps: ProviderSetupGap[];
  provider: string;
  model: string;
};

const GAP_LABELS: Record<ProviderSetupGap, string> = {
  provider: "choose a provider",
  model: "pick a model",
  key: "add that provider's API key",
};

/** Short form for the requirements blocker chips. */
export const PROVIDER_GAP_LABELS: Record<ProviderSetupGap, string> = {
  provider: "Provider missing",
  model: "Model missing",
  key: "API key missing",
};

export function providerSetupState(setup: ProviderSetup | null): ProviderSetupState {
  if (setup === null) {
    return { ready: false, gaps: ["provider", "model", "key"], provider: "", model: "" };
  }
  const gaps: ProviderSetupGap[] = [];
  if (setup.provider.trim() === "") gaps.push("provider");
  if (setup.model.trim() === "") gaps.push("model");
  if (setup.apiKey.trim().length < MIN_PROVIDER_KEY_LENGTH) gaps.push("key");
  return {
    ready: gaps.length === 0,
    gaps,
    provider: setup.provider,
    model: setup.model,
  };
}

/** One sentence naming exactly what is missing ("Nothing runs until you …"). */
export function providerSetupMessage(state: ProviderSetupState): string {
  if (state.ready) return "";
  return `Nothing runs until you ${state.gaps.map((gap) => GAP_LABELS[gap]).join(", ")}.`;
}
