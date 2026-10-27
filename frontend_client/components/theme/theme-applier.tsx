"use client";

import { useEffect, type ReactNode } from "react";
import { useHydrated } from "@/hooks/use-session";
import { applyThemePreference } from "@/lib/theme/preferences";

/**
 * Reflects the stored theme preference on <html> once per app mount.
 * Client-only (localStorage); rendering stays untouched.
 */
export function ThemeApplier({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      applyThemePreference();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated]);
  return <>{children}</>;
}
