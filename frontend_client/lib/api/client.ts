/**
 * Typed API client. Unwraps the mandated response envelope (root AGENTS.md):
 *   success: { status: true,  statusCode, data }
 *   failure: { status: false, statusCode, message, error: { code, details } }
 *
 * Contracts (`@sda/contracts`) are the single source for envelope/schema types;
 * payloads are validated at runtime. Secrets travel by header only
 * (`x-provider-api-key`, `x-project-key`) — never in URLs or storage.
 */
import {
  ApiEnvelopeSchema,
  type ErrorCode,
  type ZodType,
} from "@sda/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Client-local codes produced by this client only. The backend never sends
 * them (the registered `ErrorCode` union lives in contracts).
 */
export type ClientApiErrorCode = "NETWORK_ERROR" | "INVALID_RESPONSE";

export type ApiErrorCode = ErrorCode | ClientApiErrorCode;

/** Actionable, user-facing message per code (Phase F6 hardening refines wording). */
export const USER_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR:
    "The submitted data failed validation. Fix the highlighted fields and retry.",
  PROJECT_NOT_FOUND:
    "This project does not exist, or the link is stale. Start a new design.",
  PROJECT_ACCESS_DENIED:
    "Access to this project was denied: the project access key was missing or wrong. Reopen the project from where it was created.",
  RUN_NOT_FOUND: "The generation run was not found. Start a new generation.",
  RUN_CONFLICT:
    "A generation is already running for this project. Wait for it to finish before starting another.",
  PAYLOAD_TOO_LARGE:
    "The submitted content is too large. Shorten it and retry.",
  QUOTA_EXCEEDED:
    "Generation limit reached. Wait a while before retrying.",
  PROVIDER_AUTH_FAILED:
    "The provider rejected your API key. Open provider settings and update the key.",
  PROVIDER_RATE_LIMITED:
    "The model provider is rate-limiting requests. Wait a bit and retry.",
  PROVIDER_TIMEOUT: "The model provider timed out. Retry the generation.",
  PROVIDER_UNAVAILABLE:
    "The model provider is temporarily unavailable. Wait a moment and retry.",
  PROVIDER_UNSUPPORTED_CAPABILITY:
    "The selected model cannot provide a required capability. Pick a different model in provider settings.",
  INVALID_MODEL_OUTPUT:
    "The model returned output that could not be parsed. Retry; if it keeps failing, try another model.",
  GENERATION_REPAIR_FAILED:
    "Generated output failed validation even after repair attempts. Retry the generation.",
  DATABASE_UNAVAILABLE:
    "The backend database is unavailable. Retry shortly.",
  INTERNAL_ERROR: "An unexpected backend error occurred. Retry shortly.",
  NETWORK_ERROR:
    "Cannot reach the server. Check your connection and that the backend is running.",
  INVALID_RESPONSE:
    "The server sent a malformed response. Retry shortly.",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status when a response existed; null on network failure. */
  readonly statusCode: number | null;
  readonly details: Record<string, unknown> | undefined;
  /** Copy for the UI; `message` keeps the raw server message when present. */
  readonly userMessage: string;

  constructor(
    code: ApiErrorCode,
    options: {
      userMessage: string;
      message?: string;
      statusCode?: number | null;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(options.message ?? options.userMessage, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.statusCode = options.statusCode ?? null;
    this.details = options.details;
    this.userMessage = options.userMessage;
  }
}

export type ApiFetchOptions<T> = Omit<RequestInit, "headers"> & {
  /** Zod schema validating the `data` payload at runtime (trust boundary). */
  dataSchema?: ZodType<T>;
  /** BYOK model-provider key, sent as `x-provider-api-key`. Never part of the URL. */
  providerKey?: string;
  /** Per-project access key, sent as `x-project-key`. Never part of the URL. */
  projectKey?: string;
  headers?: HeadersInit;
};

/**
 * Fetch a backend endpoint and return the unwrapped `data`.
 * Throws {@link ApiError} on every failure path; nothing here logs.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const { dataSchema, providerKey, projectKey, headers, ...init } = options;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(providerKey !== undefined
          ? { "x-provider-api-key": providerKey }
          : {}),
        ...(projectKey !== undefined ? { "x-project-key": projectKey } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    throw new ApiError("NETWORK_ERROR", {
      userMessage: USER_MESSAGES.NETWORK_ERROR,
      cause,
    });
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new ApiError("INVALID_RESPONSE", {
      userMessage: USER_MESSAGES.INVALID_RESPONSE,
      message: `HTTP ${res.status} with a non-JSON body`,
      statusCode: res.status,
      cause,
    });
  }

  const parsed = ApiEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("INVALID_RESPONSE", {
      userMessage: USER_MESSAGES.INVALID_RESPONSE,
      message: `HTTP ${res.status} with a non-envelope body`,
      statusCode: res.status,
    });
  }

  const envelope = parsed.data;
  if (!envelope.status) {
    throw new ApiError(envelope.error.code, {
      userMessage: USER_MESSAGES[envelope.error.code],
      message: envelope.message,
      statusCode: envelope.statusCode,
      details: {
        ...envelope.error.details,
        // Envelope bug if this differs (statusCode must always match HTTP);
        // surfaced for debugging instead of crashing.
        ...(envelope.statusCode !== res.status
          ? { envelopeStatusCode: envelope.statusCode, httpStatus: res.status }
          : {}),
      },
    });
  }

  const data = envelope.data as T;
  if (dataSchema) {
    const result = dataSchema.safeParse(data);
    if (!result.success) {
      throw new ApiError("INVALID_RESPONSE", {
        userMessage: USER_MESSAGES.INVALID_RESPONSE,
        message: `HTTP ${res.status} payload failed schema validation`,
        statusCode: res.status,
      });
    }
    return result.data;
  }
  return data;
}
