/**
 * BYOK storage rules (root AGENTS.md + [[Tech-Stack]]):
 * - one namespaced entry for provider setup (key + model), sessionStorage only
 * - per-project access keys, sessionStorage only
 * - never in URLs, never in React state passed to diagram components, never logged
 */
const PROVIDER_ENTRY = "sda:provider-setup";

export type ProviderSetup = {
  provider: string;
  apiKey: string;
  model: string;
};

export const DEFAULT_SETUP: ProviderSetup = {
  provider: "openrouter",
  apiKey: "",
  model: "z-ai/glm-5.3-flash",
};

function safeSession(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

export function loadProviderSetup(): ProviderSetup | null {
  const storage = safeSession();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROVIDER_ENTRY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProviderSetup>;
    if (
      typeof parsed.provider !== "string" ||
      typeof parsed.apiKey !== "string" ||
      typeof parsed.model !== "string"
    ) {
      return null;
    }
    // Strip unknown fields by rebuilding the object.
    return {
      provider: parsed.provider,
      apiKey: parsed.apiKey,
      model: parsed.model,
    };
  } catch {
    return null;
  }
}

export function saveProviderSetup(setup: ProviderSetup): void {
  const storage = safeSession();
  if (!storage) return;
  storage.setItem(
    PROVIDER_ENTRY,
    JSON.stringify({
      provider: setup.provider,
      apiKey: setup.apiKey,
      model: setup.model,
    }),
  );
}

export function clearProviderSetup(): void {
  const storage = safeSession();
  if (!storage) return;
  storage.removeItem(PROVIDER_ENTRY);
}

export function projectAccessKeyEntry(projectId: string): string {
  return `sda:project:${projectId}:access-key`;
}

export function loadProjectAccessKey(projectId: string): string | null {
  const storage = safeSession();
  if (!storage) return null;
  const key = storage.getItem(projectAccessKeyEntry(projectId));
  return key && key.length > 0 ? key : null;
}

export function saveProjectAccessKey(projectId: string, accessKey: string): void {
  const storage = safeSession();
  if (!storage) return;
  storage.setItem(projectAccessKeyEntry(projectId), accessKey);
}
