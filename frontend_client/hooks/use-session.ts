"use client";

/**
 * React binding for the auth session store: re-renders on the
 * `sda:auth-changed` event so login/logout/expire update every subscriber.
 * SSR-safe via useSyncExternalStore's server snapshot (no session on the
 * server); a periodic sweep re-checks expiry between events.
 */

import { useSyncExternalStore } from "react";
import {
  AUTH_CHANGED_EVENT,
  type StoredSession,
  clearSession,
  loadSession,
  sessionBootSettled,
} from "@/lib/session/auth";
import { apiFetch } from "@/lib/api/client";

function subscribe(onChange: () => void): () => void {
  const bound = () => {
    loadSession(); // re-check expiry; may clear + dispatch internally
    onChange();
  };
  window.addEventListener(AUTH_CHANGED_EVENT, bound);
  window.addEventListener("storage", bound); // other tabs of the same browser
  const sweep = window.setInterval(bound, 30_000);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, bound);
    window.removeEventListener("storage", bound);
    window.clearInterval(sweep);
  };
}

function getClientSnapshot(): StoredSession | null {
  return loadSession();
}

function getServerSnapshot(): null {
  return null;
}

export function useSession(): StoredSession | null {
  const session = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return session;
}

/**
 * True once the boot refresh attempt finished. Route guards wait for this so a
 * new tab with only the refresh cookie is restored instead of bounced to login.
 */
export function useAuthBootSettled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => sessionBootSettled(),
    () => false,
  );
}

/**
 * True once the client has hydrated. Guards must wait for this: during the
 * hydration commit useSyncExternalStore still reports the server snapshot
 * (null session), and acting on that would sign every user out.
 */
const noopSubscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Revokes the server session (best effort — the row dies at TTL anyway; a
 * network failure must never strand the user signed in) and clears the
 * local store.
 */
export async function signOut(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", auth: true });
  } catch {
    // Token invalid / backend unreachable — the local clear below is enough.
  }
  clearSession();
}

export function useActiveSession(): { session: StoredSession | null; signOut: () => Promise<void> } {
  return { session: useSession(), signOut };
}
