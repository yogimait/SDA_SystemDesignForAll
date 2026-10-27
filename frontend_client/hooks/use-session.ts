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
} from "@/lib/session/auth";

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

export function useActiveSession(): { session: StoredSession | null; signOut: () => void } {
  return { session: useSession(), signOut: clearSession };
}
