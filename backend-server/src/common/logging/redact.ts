const SECRET_KEY_PATTERN =
  /((?:api[_-]?key|authorization|x-provider-api-key|x-project-key|access[_-]?key|secret|password)["']?\s*[:=]\s*["']?)([^"'\s,;}]+)/gi;

const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

/**
 * Last line of defence for logs. Keys never enter logs by design; this also
 * covers accidental error messages and dependency logs.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(BEARER_PATTERN, "$1[REDACTED]")
    .replace(SECRET_KEY_PATTERN, "$1[REDACTED]");
}
