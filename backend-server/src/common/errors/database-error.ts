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

/** True when the partial unique index rejects a second active run. */
export function isActiveRunConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ((error as { code?: unknown }).code !== "23505") {
    return false;
  }
  const constraint = (error as { constraint?: unknown }).constraint;
  if (constraint === "runs_one_active_project_idx") {
    return true;
  }
  const message = (error as { message?: unknown }).message;
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
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ((error as { code?: unknown }).code !== "23505") {
    return false;
  }
  const constraint = (error as { constraint?: unknown }).constraint;
  if (constraint === "users_email_unique") {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" && message.includes("users_email_unique")
  );
}
