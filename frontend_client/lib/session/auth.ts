/**
 * Authenticated session state (user/auth round 2026-10-27):
 * - Access token lives in sessionStorage only (dies with the tab), never in
 *   URLs, logs, localStorage, or persisted project data.
 * - The stored user snapshot lets the UI render immediately on restore; the
 *   contracts define no refresh/me endpoint yet, so an expired session is
 *   simply dropped (re-login required).
 * - `loadSession` always re-reads storage (expiry enforced per read).
 *   `useSession` (hooks/) reads a stable module snapshot through
 *   useSyncExternalStore so React renders stay referentially stable.
 */
import type { AuthResponse, User } from "@sda/contracts";

const SESSION_ENTRY = "sda:auth:session";
export const AUTH_CHANGED_EVENT = "sda:auth-changed";

export type StoredSession = {
  user: User;
  accessToken: string;
  expiresAt: string;
};

/** Module-level snapshot for useSyncExternalStore (stable between changes). */
let snapshot: StoredSession | null = null;
let snapshotDirty = true;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

function readStored(storage: Storage | null): StoredSession | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(SESSION_ENTRY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { expiresAt?: unknown }).expiresAt !== "string" ||
      typeof (parsed as { accessToken?: unknown }).accessToken !== "string"
    ) {
      return null;
    }
    const candidate = parsed as StoredSession;
    if (typeof candidate.user?.id !== "string") return null;
    const expires = new Date(candidate.expiresAt).getTime();
    if (Number.isNaN(expires) || expires <= Date.now()) {
      storage.removeItem(SESSION_ENTRY);
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

/** Re-reads storage into the module snapshot; returns true when it changed.
 * The returned object reference stays stable while content is unchanged —
 * required by useSyncExternalStore's getSnapshot contract. */
function refreshSnapshot(): boolean {
  const next = readStored(safeStorage());
  if (JSON.stringify(next) !== JSON.stringify(snapshot) || snapshotDirty) {
    snapshot = next;
    snapshotDirty = false;
    return true;
  }
  return false;
}

export function saveSession(auth: AuthResponse): StoredSession {
  const session: StoredSession = {
    user: auth.user,
    accessToken: auth.accessToken,
    expiresAt: auth.expiresAt,
  };
  const storage = safeStorage();
  if (storage !== null) {
    storage.setItem(SESSION_ENTRY, JSON.stringify(session));
    snapshot = session;
    snapshotDirty = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    }
  }
  return session;
}

export function clearSession(): void {
  const storage = safeStorage();
  if (storage !== null && storage.getItem(SESSION_ENTRY) !== null) {
    storage.removeItem(SESSION_ENTRY);
    snapshot = null;
    snapshotDirty = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    }
  }
}

/** Live (unexpired) session, or null — expired sessions are dropped. */
export function loadSession(): StoredSession | null {
  const changed = refreshSnapshot();
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
  return snapshot;
}
