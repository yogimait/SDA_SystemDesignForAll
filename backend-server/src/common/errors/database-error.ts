/**
 * Narrow detection of common Postgres/driver connection failures. Repositories
 * do not wrap every query; translation happens once at the HTTP boundary.
 */
const DATABASE_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08006",
  "080P01",
  "57P01",
  "57P02",
  "57P03",
  "3D000",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
]);

const DATABASE_MESSAGE_PATTERN =
  /(connect ECONNREFUSED|connection terminated|database .* does not exist|the database system is (starting up|shutting down)|password authentication failed)/i;

/** Drizzle wraps driver errors; inspect the cause chain for Postgres codes. */
function unwrapDatabaseError(
  error: unknown,
): { code?: unknown; constraint?: unknown; message?: unknown } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.code !== undefined || candidate.constraint !== undefined) {
      return candidate;
    }
    current = candidate.cause;
  }
  return typeof error === "object" && error !== null
    ? (error as { message?: unknown })
    : null;
}

/** True when the partial unique index rejects a second active run. */
export function isActiveRunConflict(error: unknown): boolean {
  const details = unwrapDatabaseError(error);
  if (!details || details.code !== "23505") {
    return false;
  }
  const constraint = details.constraint;
  if (constraint === "runs_one_active_project_idx") {
    return true;
  }
  const message = details.message;
  return (
    typeof message === "string" &&
    message.includes("runs_one_active_project_idx")
  );
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && DATABASE_ERROR_CODES.has(code)) {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" && DATABASE_MESSAGE_PATTERN.test(message)
  );
}

/** True when the users email unique index rejects a duplicate registration. */
export function isEmailConflict(error: unknown): boolean {
  const details = unwrapDatabaseError(error);
  if (!details || details.code !== "23505") {
    return false;
  }
  const constraint = details.constraint;
  if (constraint === "users_email_unique") {
    return true;
  }
  const message = details.message;
  return (
    typeof message === "string" && message.includes("users_email_unique")
  );
}

const SPEC_ID_CONSTRAINTS = new Set([
  "requirements_pkey",
  "assumptions_pkey",
  "clarification_questions_pkey",
]);

/** True when a requirement, assumption, or clarification id already exists globally. */
export function isSpecIdConflict(error: unknown): boolean {
  const details = unwrapDatabaseError(error);
  if (!details || details.code !== "23505") {
    return false;
  }
  const constraint = details.constraint;
  if (typeof constraint === "string" && SPEC_ID_CONSTRAINTS.has(constraint)) {
    return true;
  }
  const message = details.message;
  return (
    typeof message === "string" &&
    [...SPEC_ID_CONSTRAINTS].some((name) => message.includes(name))
  );
}
