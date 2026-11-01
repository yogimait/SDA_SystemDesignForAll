const SECRET_KEY_PATTERN =
  /((?:api[_-]?key|authorization|x-provider-api-key|x-project-key|access[_-]?key|secret|password)["']?\s*[:=]\s*["']?)([^"'\s,;}]+)/gi;

const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

/**
 * Bare provider keys, even when a provider echoes one back without a label.
 * Longer prefixes are listed first so `sk-or-v1-...` is not half-matched.
 */
const PROVIDER_KEY_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9_-]{8,})\b/g;

const SECRET_DETAIL_KEY_PATTERN =
  /^(?:api[_-]?key|authorization|x-provider-api-key|x-project-key|access[_-]?key|secret|password)$/i;

/**
 * Last line of defence for logs. Keys never enter logs by design; this also
 * covers accidental error messages and dependency logs.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(BEARER_PATTERN, "$1[REDACTED]")
    .replace(SECRET_KEY_PATTERN, "$1[REDACTED]")
    .replace(PROVIDER_KEY_PATTERN, "[REDACTED]");
}

/** Recursive scrub for `AppError.details` before persisting or serializing. */
export function redactDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return redactValue(details, 0) as Record<string, unknown>;
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (depth >= 8) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SECRET_DETAIL_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactValue(item, depth + 1);
    }
    return result;
  }
  return value;
}
