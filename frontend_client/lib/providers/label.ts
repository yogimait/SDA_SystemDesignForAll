/**
 * Provider ids come from `GET /api/providers`; the UI shows proper names, not
 * raw ids. Unknown ids fall back to a capitalized form rather than breaking.
 */
const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  groq: "Groq",
};

export function providerLabel(id: string): string {
  return (
    PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
  );
}
