import { z } from "zod";

/**
 * Registered error codes. New codes must be added here, never inlined by callers.
 * Shared with both apps via @sda/contracts (root AGENTS.md: "Error codes live
 * in one registry module").
 */
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PROJECT_NOT_FOUND",
  "PROJECT_ACCESS_DENIED",
  "AUTH_REQUIRED",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_EMAIL_TAKEN",
  "USER_NOT_FOUND",
  "RUN_NOT_FOUND",
  "RUN_CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "QUOTA_EXCEEDED",
  "PLAN_LIMIT_EXCEEDED",
  "PLAN_UPGRADE_REQUIRED",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_CONFIG_NOT_FOUND",
  "PROVIDER_UNSUPPORTED_CAPABILITY",
  "INVALID_MODEL_OUTPUT",
  "GENERATION_REPAIR_FAILED",
  "DATABASE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status range guard: statusCode in the body always matches HTTP (root AGENTS.md). */
export const StatusCodeSchema = z.number().int().min(100).max(599);

export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const FailEnvelopeSchema = z.object({
  status: z.literal(false),
  statusCode: StatusCodeSchema,
  message: z.string(),
  error: ApiErrorBodySchema,
});

export type FailEnvelope = z.infer<typeof FailEnvelopeSchema>;

export const SuccessEnvelopeSchema = z.object({
  status: z.literal(true),
  statusCode: StatusCodeSchema,
  data: z.unknown(),
});

export type SuccessEnvelope<T> = {
  status: true;
  statusCode: number;
  data: T;
};

export const ApiEnvelopeSchema = z.union([SuccessEnvelopeSchema, FailEnvelopeSchema]);

/** Single construction point for success envelopes (used by backend controllers). */
export function ok<T>(data: T, statusCode = 200): SuccessEnvelope<T> {
  return { status: true, statusCode, data };
}

/**
 * Single construction point for error envelopes (used by backend filters/services).
 * @param statusCode must match the actual HTTP status of the response.
 */
export function fail(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  statusCode = 400,
): FailEnvelope {
  return {
    status: false,
    statusCode,
    message,
    error: details === undefined ? { code } : { code, details },
  };
}
