/**
 * BYOK storage rules (root AGENTS.md + [[Tech-Stack]]):
 * - one namespaced entry for provider setup: active provider + model plus a
 *   key per provider (so switching providers never overwrites the other key),
 *   sessionStorage only
 * - per-project access keys, sessionStorage only
 * - never in URLs, never in React state passed to diagram components, never logged
 */
const PROVIDER_ENTRY = "sda:provider-setup";

export type ProviderSetup = {
  provider: string;
  apiKey: string;
  model: string;
};

/** On-disk shape: keys are stored per provider id. */
type StoredSetup = {
  provider: string;
  model: string;
  keys: Record<string, string>;
};

export type ProviderKeys = Record<string, string>;

function safeSession(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

function cleanKeys(value: unknown): ProviderKeys {
  if (typeof value !== "object" || value === null) return {};
  const keys: ProviderKeys = {};
  for (const [id, key] of Object.entries(value)) {
    if (typeof key === "string") keys[id] = key;
  }
  return keys;
}

/** Reads the entry, migrating the pre-multi-provider `{apiKey}` shape. */
function readStored(): StoredSetup | null {
  const storage = safeSession();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROVIDER_ENTRY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSetup> & { apiKey?: unknown };
    if (typeof parsed.provider !== "string" || typeof parsed.model !== "string") {
      return null;
    }
    const keys = cleanKeys(parsed.keys);
    if (typeof parsed.apiKey === "string" && parsed.apiKey !== "") {
      keys[parsed.provider] = parsed.apiKey;
    }
    return { provider: parsed.provider, model: parsed.model, keys };
  } catch {
    return null;
  }
}

/** Active setup: the provider the user picked, its key, and its model. */
export function loadProviderSetup(): ProviderSetup | null {
  const stored = readStored();
  if (stored === null) return null;
  return {
    provider: stored.provider,
    apiKey: stored.keys[stored.provider] ?? "",
    model: stored.model,
  };
}

/** Keys the user typed this tab, per provider id. */
export function loadProviderKeys(): ProviderKeys {
  return readStored()?.keys ?? {};
}

export function saveProviderSetup(setup: ProviderSetup): void {
  const storage = safeSession();
  if (!storage) return;
  const keys = readStored()?.keys ?? {};
  const apiKey = setup.apiKey.trim();
  // An emptied key removes that provider's entry instead of storing "".
  if (apiKey === "") delete keys[setup.provider];
  else keys[setup.provider] = apiKey;
  const stored: StoredSetup = {
    provider: setup.provider,
    model: setup.model,
    keys,
  };
  storage.setItem(PROVIDER_ENTRY, JSON.stringify(stored));
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

/**
 * Sign-in-and-continue: an idea typed on the landing page before signing in.
 * Survives the login redirect (sessionStorage), consumed once — the value is
 * plain text (the user's own input) so no JSON needed.
 */
const PENDING_IDEA_ENTRY = "sda:pending-idea";

export function savePendingIdea(idea: string): void {
  safeSession()?.setItem(PENDING_IDEA_ENTRY, idea);
}

export function peekPendingIdea(): string | null {
  const idea = safeSession()?.getItem(PENDING_IDEA_ENTRY);
  return idea && idea.length > 0 ? idea : null;
}

/** Returns the stashed idea and clears the slot (consume once). */
export function consumePendingIdea(): string | null {
  const storage = safeSession();
  if (!storage) return null;
  const idea = storage.getItem(PENDING_IDEA_ENTRY);
  storage.removeItem(PENDING_IDEA_ENTRY);
  return idea && idea.length > 0 ? idea : null;
}
