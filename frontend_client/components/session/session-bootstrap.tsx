"use client";

/**
 * Refresh-on-boot: the access token is memory-only, so a reload (or a new tab
 * restoring the identity snapshot) mints a fresh one from the httpOnly refresh
 * cookie. One call for the whole app; concurrent callers share the request via
 * the client's single-flight latch. A failure clears the identity and sends the
 * tab to `/login?next=…` (the shared store notifies every subscriber first).
 */

import { useEffect } from "react";
import { useHydrated } from "@/hooks/use-session";
import { ensureAccessToken } from "@/lib/api/client";
import { markSessionBootSettled } from "@/lib/session/auth";

export function SessionBootstrap() {
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    void ensureAccessToken().finally(() => markSessionBootSettled());
  }, [hydrated]);

  return null;
}
