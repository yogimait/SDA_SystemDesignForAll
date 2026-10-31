/**
 * Same-origin redirect target for `?next=` on the auth pages.
 *
 * The value comes from the URL, so treat it as hostile: only a rooted relative
 * path may be resumed. Protocol-relative (`//host`), scheme (`https:`,
 * `javascript:`), backslash and control-character inputs fall back instead of
 * letting an unauthenticated link bounce a freshly signed-in user off-origin.
 */

const DEFAULT_NEXT = "/library";

/** Accept only a same-origin relative path; anything else gets the fallback. */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (raw === null || raw === undefined) return fallback;
  const value = raw.trim();
  if (value === "" || value[0] !== "/") return fallback;
  // `//evil.example` and `/\evil.example` both resolve to another origin.
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // Browsers strip tabs/newlines from URLs, so reject them before parsing.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const parsed = new URL(value, "http://next.invalid");
    if (parsed.protocol !== "http:" || parsed.host !== "next.invalid") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
