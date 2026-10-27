"use client";

/**
 * Stored theme preference plumbing. The brand ships one dark "coffee" palette
 * (user decision 2026-10-23, see globals.css) and no light token set exists
 * yet, so applying today means reflecting the stored choice on
 * `document.documentElement.dataset.theme`; a palette switch follows when
 * light tokens land.
 */
const THEME_ENTRY = "sda:theme-pref";

export type StoredTheme = "system" | "light" | "dark";

export function loadThemePreference(): StoredTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_ENTRY);
    return raw === "system" || raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null; // storage disabled by policy
  }
}

export function saveThemePreference(theme: StoredTheme): void {
  try {
    window.localStorage.setItem(THEME_ENTRY, theme);
  } catch {
    // Storage unavailable — the server-side preference still persists.
  }
}

export function applyThemePreference(): void {
  const theme = loadThemePreference() ?? "dark";
  document.documentElement.dataset.theme = theme;
}
