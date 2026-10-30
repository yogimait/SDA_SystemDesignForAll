/**
 * Auth session store (auth-hardening round):
 * - The access token (15m TTL) lives in **memory only** — never localStorage,
 *   never sessionStorage, never URLs/logs. The httpOnly refresh cookie is the
 *   only persisted credential, so a page reload re-mints the token through
 *   `POST /api/auth/refresh` (see `ensureAccessToken` in lib/api/client.ts).
 * - Only the user snapshot (identity, plan, verification) is persisted
 *   (sessionStorage), so the header/library can render instantly while the
 *   refresh completes. Legacy entries that still contain a token are migrated:
 *   the user is kept, the token is deleted.
 * - `loadSession` returns a `pending` session (empty accessToken) once the
 *   identity exists; `sessionStatus()` distinguishes authenticated / pending /
 *   anonymous for guards that need the difference.
 */
import { UserSchema, type AuthResponse, type User } from "@sda/contracts";

const IDENTITY_ENTRY = "sda:auth:user";
/** Pre-hardening entry that embedded the access token — removed on read. */
const LEGACY_SESSION_ENTRY = "sda:auth:session";
export const AUTH_CHANGED_EVENT = "sda:auth-changed";
export const CSRF_COOKIE = "sda_csrf";

/** The logout call runs while the session is being discarded; it must not
 *  trigger the "sign in again" redirect (the header already routes to /login). */
export const LOGOUT_PATH = "/api/auth/logout";

export type StoredSession = {
  user: User;
  /** Empty while a refresh is still pending (page reload / boot). */
  accessToken: string;
  /** Empty while a refresh is still pending. */
  expiresAt: string;
};

export type SessionStatus = "authenticated" | "pending" | "anonymous";

/** Module-level snapshots: authenticated (token in memory) and provisional. */
let snapshot: StoredSession | null = null;
let provisional: StoredSession | null = null;
let identity: User | null = null;
/** Raw persisted value the cached identity was parsed from (keeps refs stable). */
let identityRaw: string | null = null;
/** Bumped whenever the session is cleared; stale refreshes must not resurrect it. */
let epoch = 0;
/** False until the first boot refresh attempt finishes (guards must wait). */
let bootSettled = false;

export function sessionEpoch(): number {
  return epoch;
}

/** Guards redirect only once the boot refresh has had its chance. */
export function sessionBootSettled(): boolean {
  return bootSettled;
}

export function markSessionBootSettled(): void {
  if (bootSettled) return;
  bootSettled = true;
  dispatch();
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

function isExpired(session: StoredSession): boolean {
  if (session.expiresAt === "") return true;
  const expires = new Date(session.expiresAt).getTime();
  return Number.isNaN(expires) || expires <= Date.now() + 5_000;
}

function parseIdentity(storage: Storage, raw: string | null): User | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const user = UserSchema.safeParse((parsed as { user?: unknown } | null)?.user);
    if (user.success) return user.data;
  } catch {
    // fall through: drop the entry below
  }
  storage.removeItem(IDENTITY_ENTRY);
  return null;
}

/** Reads (and migrates) the persisted identity, caching by raw value. */
function loadIdentity(): User | null {
  const storage = safeStorage();
  if (storage === null) return null;

  let raw = storage.getItem(IDENTITY_ENTRY);
  if (raw === null) {
    // Migration: keep the identity, drop the embedded access token.
    const legacy = storage.getItem(LEGACY_SESSION_ENTRY);
    if (legacy !== null) {
      storage.removeItem(LEGACY_SESSION_ENTRY);
      try {
        const user = UserSchema.safeParse(
          (JSON.parse(legacy) as { user?: unknown } | null)?.user,
        );
        if (user.success) {
          raw = JSON.stringify({ user: user.data });
          storage.setItem(IDENTITY_ENTRY, raw);
        }
      } catch {
        // malformed legacy entry: nothing to migrate
      }
    }
  }

  if (raw === identityRaw) return identity;
  identityRaw = raw;
  identity = parseIdentity(storage, raw);
  return identity;
}

function persistIdentity(user: User | null): void {
  const storage = safeStorage();
  if (storage === null) return;
  if (user === null) storage.removeItem(IDENTITY_ENTRY);
  else storage.setItem(IDENTITY_ENTRY, JSON.stringify({ user }));
}

function dispatch(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

/** Current session: authenticated token, else the provisional identity. */
export function loadSession(): StoredSession | null {
  if (snapshot !== null && !isExpired(snapshot)) return snapshot;
  const user = snapshot?.user ?? loadIdentity();
  if (user === null) return null;
  if (provisional === null || provisional.user !== user) {
    provisional = { user, accessToken: "", expiresAt: "" };
  }
  return provisional;
}

export function sessionStatus(): SessionStatus {
  if (snapshot !== null && !isExpired(snapshot)) return "authenticated";
  if (loadSession() !== null) return "pending";
  return "anonymous";
}

export function saveSession(auth: AuthResponse): StoredSession {
  const session: StoredSession = {
    user: auth.user,
    accessToken: auth.accessToken,
    expiresAt: auth.expiresAt,
  };
  snapshot = session;
  provisional = null;
  identity = auth.user;
  identityRaw = JSON.stringify({ user: auth.user });
  persistIdentity(auth.user);
  dispatch();
  return session;
}

/** Refreshes identity fields (plan tier, verification) without touching the token. */
export function updateSessionUser(user: User): void {
  identity = user;
  identityRaw = JSON.stringify({ user });
  persistIdentity(user);
  if (snapshot !== null) snapshot = { ...snapshot, user };
  provisional = null;
  dispatch();
}

export function clearSession(): void {
  const hadSession = snapshot !== null || loadSession() !== null;
  snapshot = null;
  provisional = null;
  identity = null;
  identityRaw = null;
  epoch += 1;
  persistIdentity(null);
  if (hadSession) dispatch();
}

/** Double-submit nonce for cookie-authenticated mutations (refresh/logout/…). */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  if (match === undefined) return null;
  const value = decodeURIComponent(match.slice(CSRF_COOKIE.length + 1));
  return value === "" ? null : value;
}

/**
 * A readable CSRF cookie ships together with the httpOnly refresh cookie.
 * Its presence is the only signal a new tab gets that the refresh cookie may
 * exist, since the refresh token itself is unreadable by design.
 */
export function hasRefreshHint(): boolean {
  return readCsrfToken() !== null;
}

/**
 * A server-rejected session (refresh failed / 401 after a retry): drop the
 * local identity — the shared store notifies every subscriber, so the header
 * stops showing the identity — then send the tab to sign in again.
 */
export function handleAuthRequired(): void {
  clearSession();
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return; // no redirect loop on the sign-in page
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- runs inside the API client (no router); a full reload is deliberate so no stale page state survives the sign-out
  window.location.assign(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
}

/** True when this tab believes it is signed in (token or pending refresh). */
export function hasSession(): boolean {
  return loadSession() !== null;
}

export type { User };
