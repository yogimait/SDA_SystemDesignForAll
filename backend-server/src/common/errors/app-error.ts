import type { ErrorCode } from "@sda/contracts";

/**
 * The only place an error code becomes an HTTP status. Adding a code to the
 * shared registry without mapping it here is a TypeScript error.
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  PROJECT_NOT_FOUND: 404,
  PROJECT_ACCESS_DENIED: 403,
  RUN_NOT_FOUND: 404,
  RUN_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  QUOTA_EXCEEDED: 429,
  PROVIDER_AUTH_FAILED: 502,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_UNSUPPORTED_CAPABILITY: 502,
  INVALID_MODEL_OUTPUT: 502,
  GENERATION_REPAIR_FAILED: 422,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Safe, actionable default copy. Services may override with more context. */
export const ERROR_DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "The request is invalid. Check the submitted fields.",
  PROJECT_NOT_FOUND: "The requested project does not exist.",
  PROJECT_ACCESS_DENIED:
    "Access denied. Send the project key in the x-project-key header.",
  RUN_NOT_FOUND: "The requested generation run does not exist.",
  RUN_CONFLICT:
    "A generation run is already active for this project. Wait for it to finish.",
  PAYLOAD_TOO_LARGE: "The request body is too large.",
  QUOTA_EXCEEDED: "Too many requests. Try again later.",
  PROVIDER_AUTH_FAILED:
    "The provider rejected the API key. Check the key and try again.",
  PROVIDER_RATE_LIMITED:
    "The model provider is rate limiting requests. Try again shortly.",
  PROVIDER_TIMEOUT: "The model provider did not respond in time.",
  PROVIDER_UNAVAILABLE:
    "The model provider is currently unavailable. Try again later.",
  PROVIDER_UNSUPPORTED_CAPABILITY:
    "The model provider does not support this generation request.",
  INVALID_MODEL_OUTPUT:
    "The model returned output that could not be parsed as JSON.",
  GENERATION_REPAIR_FAILED:
    "The model output stayed invalid after repair attempts. Try again.",
  DATABASE_UNAVAILABLE:
    "The database is currently unavailable. Try again later.",
  INTERNAL_ERROR: "An unexpected error occurred.",
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = ERROR_DEFAULT_MESSAGES[code],
    readonly details?: Record<string, unknown>,
    readonly statusCode: number = ERROR_HTTP_STATUS[code],
  ) {
    super(message);
    this.name = "AppError";
  }
}
