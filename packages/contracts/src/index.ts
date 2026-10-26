/**
 * Shared contracts for both apps. All JSON API bodies use the envelope:
 *   success: { status: true,  statusCode, data }
 *   failure: { status: false, statusCode, message, error: { code, details? } }
 *
 * Scope note (keep contracts honest):
 * - Envelope schemas, error-code registry, and ok/fail helpers.
 * - Project, requirements, run, provider, and canonical ArchitectureModel DTOs.
 * - Zod is re-exported so both apps validate through this package only.
 */
import { z } from "zod";
import { FailEnvelopeSchema } from "./envelope.js";

export type SuccessEnvelopeOf<T> = { status: true; statusCode: number; data: T };

export type EnvelopeOf<D extends z.ZodTypeAny> =
  | { status: true; statusCode: number; data: z.output<D> }
  | z.output<typeof FailEnvelopeSchema>;

/**
 * Envelope schema over a typed payload — validates `data` with the given schema
 * and keeps failure branches intact. Use on both sides: backend interceptor
 * parse-out, frontend client unwrap.
 */
export function envelopeSchema<D extends z.ZodTypeAny>(dataSchema: D) {
  return z.union([
    z.object({
      status: z.literal(true),
      statusCode: z.number().int().min(100).max(599),
      data: dataSchema,
    }),
    FailEnvelopeSchema,
  ]);
}

// Re-export everything from the envelope module so consumers import one package only.
export {
  ApiEnvelopeSchema,
  ApiErrorBodySchema,
  ErrorCodeSchema,
  FailEnvelopeSchema,
  StatusCodeSchema,
  SuccessEnvelopeSchema,
  fail,
  ok,
} from "./envelope.js";
export type {
  ApiErrorBody,
  ErrorCode,
  FailEnvelope,
  SuccessEnvelope,
} from "./envelope.js";

// Domain contracts shared by backend and frontend.
export * from "./requirements.js";
export * from "./projects.js";
export * from "./runs.js";
export * from "./providers.js";
export * from "./architecture.js";

// Zod surface re-exported: contracts is the single validation surface for both
// apps — consumers import `z` / types from here, never from "zod" directly.
export * from "zod";
export type { ZodType } from "zod";
