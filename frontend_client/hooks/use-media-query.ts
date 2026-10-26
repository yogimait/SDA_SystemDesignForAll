"use client";

/**
 * SSR-safe matchMedia hook (F6): false during prerender, live-updated after
 * hydrate. Used for the workspace responsive layout breakpoints.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const update = () => setMatches(mediaQueryList.matches);
    update();
    mediaQueryList.addEventListener("change", update);
    return () => mediaQueryList.removeEventListener("change", update);
  }, [query]);

  return matches;
}
