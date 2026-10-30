/**
 * Typed API client. Unwraps the mandated response envelope (root AGENTS.md):
 *   success: { status: true,  statusCode, data }
 *   failure: { status: false, statusCode, message, error: { code, details } }
 *
 * Auth hardening:
 * - every request sends cookies (`credentials: "include"`); the refresh token
 *   is an httpOnly cookie, the access token is memory-only.
 * - `auth: true` ensures a live access token first (`ensureAccessToken`), and a
 *   401 `AUTH_REQUIRED` triggers exactly ONE refresh + retry. A failed refresh
 *   clears the session and redirects to `/login?next=…`.
 * - state-changing requests carry `x-csrf-token` from the readable `sda_csrf`
 *   cookie (double-submit; same-site origin).
 * Secrets travel by header only (`x-provider-api-key`, `x-project-key`) —
 * never in URLs or storage.
 */
import {
  ApiEnvelopeSchema,
  AuthResponseSchema,
  type ErrorCode,
  type ZodType,
} from "@sda/contracts";
import {
  LOGOUT_PATH,
  clearSession,
  handleAuthRequired,
  hasRefreshHint,
  loadSession,
  readCsrfToken,
  saveSession,
  sessionEpoch,
} from "../session/auth";

/** Public API base — exported for the run-stream hook (SSE fetch, not envelope). */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const REFRESH_PATH = "/api/auth/refresh";

/** Endpoints that must never start a refresh loop. */
const AUTH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  REFRESH_PATH,
  LOGOUT_PATH,
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
]);

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
  ROUTE_NOT_FOUND:
    "That endpoint does not exist on this server. The app may be out of date — reload the page and retry.",
  PROJECT_NOT_FOUND:
    "This project does not exist, or the link is stale. Start a new design.",
  PROJECT_ACCESS_DENIED:
    "Access to this project was denied: the project access key was missing or wrong. Reopen the project from where it was created.",
  AUTH_REQUIRED: "Sign in to continue. Your session is missing or expired.",
  AUTH_INVALID_CREDENTIALS:
    "The email or password is incorrect. Check your entries and retry.",
  AUTH_EMAIL_TAKEN:
    "That email is already registered. Sign in instead, or use another email.",
  USER_NOT_FOUND: "The requested user account was not found.",
  RUN_NOT_FOUND: "The generation run was not found. Start a new generation.",
  RUN_CONFLICT:
    "A generation is already running for this project. Wait for it to finish before starting another.",
  PAYLOAD_TOO_LARGE:
    "The submitted content is too large. Shorten it and retry.",
  QUOTA_EXCEEDED:
    "Generation limit reached. Wait a while before retrying.",
  PLAN_LIMIT_EXCEEDED:
    "This action exceeds your current plan limit. Upgrade your plan to continue.",
  PLAN_UPGRADE_REQUIRED:
    "This feature requires a higher plan. Upgrade your plan to continue.",
  PROVIDER_AUTH_FAILED:
    "The provider rejected your API key. Open provider settings and update the key.",
  PROVIDER_RATE_LIMITED:
    "The model provider is rate-limiting requests. Wait a bit and retry.",
  PROVIDER_TIMEOUT: "The model provider timed out. Retry the generation.",
  PROVIDER_UNAVAILABLE:
    "The model provider is temporarily unavailable. Wait a moment and retry.",
  PROVIDER_CONFIG_NOT_FOUND:
    "No saved provider setup was found. Save provider settings before retrying.",
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

export class ApiError extends Error {  readonly code: ApiErrorCode;
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

/** The verification gate reuses AUTH_REQUIRED; the UI gives it its own action. */
export function requiresEmailVerification(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === "AUTH_REQUIRED" &&
    error.details?.reason === "email_not_verified"
  );
}

export type ApiFetchOptions<T> = Omit<RequestInit, "headers"> & {  /** Zod schema validating the `data` payload at runtime (trust boundary). */
  dataSchema?: ZodType<T>;
  /** BYOK model-provider key, sent as `x-provider-api-key`. Never part of the URL. */
  providerKey?: string;
  /** Per-project access key, sent as `x-project-key`. Never part of the URL.
   *  `null` is allowed for owner-Bearer-only flows and skips the header. */
  projectKey?: string | null;
  /** Attach the authenticated session's access token as a Bearer header. */
  auth?: boolean;
  headers?: HeadersInit;
  /** Internal: one retry after a refresh; never set by callers. */
  retried?: boolean;
};

function withCsrf(headers: Record<string, string>): Record<string, string> {
  const token = readCsrfToken();
  if (token !== null) headers["x-csrf-token"] = token;
  return headers;
}

function accessTokenIsFresh(session: { accessToken: string; expiresAt: string }): boolean {
  if (session.accessToken === "" || session.expiresAt === "") return false;
  const expires = new Date(session.expiresAt).getTime();
  return !Number.isNaN(expires) && expires > Date.now() + 5_000;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Rotates the refresh cookie into a new access token (single-flight: concurrent
 * callers share one request). Returns null when the cookie is missing/revoked;
 * the caller decides whether that means "signed out".
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight !== null) return refreshInFlight;
  const startedEpoch = sessionEpoch();
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
        method: "POST",
        credentials: "include",
        headers: withCsrf({}),
      });
      const body: unknown = await res.json();
      const envelope = ApiEnvelopeSchema.safeParse(body);
      if (!envelope.success || !envelope.data.status) return null;
      const auth = AuthResponseSchema.safeParse(envelope.data.data);
      if (!auth.success) return null;
      // A concurrent sign-out (401 handler) may have cleared the tab while this
      // request was in flight; never resurrect a session that was just dropped.
      if (sessionEpoch() !== startedEpoch) return null;
      saveSession(auth.data);
      return auth.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Returns a usable access token: the in-memory one when fresh, otherwise a
 * refreshed one.
 *
 * A refresh is also attempted when **no identity snapshot exists** but the
 * cookie pair hints at a refresh credential (new tab / cleared sessionStorage):
 * the identity is restored from `AuthResponse.user` on success. A failed refresh
 * signs the tab out only when an identity existed; a stale cookie on an
 * anonymous visit is ignored (no redirect bounce).
 */
export async function ensureAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (session !== null && accessTokenIsFresh(session)) return session.accessToken;
  if (session === null && !hasRefreshHint()) return null;
  const token = await refreshAccessToken();
  if (token === null && session !== null) {
    clearSession();
    handleAuthRequired();
  }
  return token;
}

async function readEnvelope(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (cause) {
    throw new ApiError("INVALID_RESPONSE", {
      userMessage: USER_MESSAGES.INVALID_RESPONSE,
      message: `HTTP ${res.status} with a non-JSON body`,
      statusCode: res.status,
      cause,
    });
  }
}

/**
 * Fetch a backend endpoint and return the unwrapped `data`.
 * Throws {@link ApiError} on every failure path; nothing here logs.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const {
    dataSchema,
    providerKey,
    projectKey,
    auth,
    headers,
    retried = false,
    ...init
  } = options;

  const method = (init.method ?? "GET").toUpperCase();
  const requestHeaders: Record<string, string> = {
    ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
  };
  if (providerKey !== undefined) requestHeaders["x-provider-api-key"] = providerKey;
  // Truthy guard: a null-cast key must never travel as a literal "null".
  if (projectKey) requestHeaders["x-project-key"] = projectKey;
  // Cookie-authenticated mutations need the double-submit nonce.
  if (method !== "GET" && method !== "HEAD") withCsrf(requestHeaders);

  let token: string | null = null;
  if (auth === true) {
    token = await ensureAccessToken();
    // The access token travels by header only — never in URLs, queries, or logs.
    if (token !== null) requestHeaders.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...requestHeaders,
        ...headers,
      },
    });
  } catch (cause) {
    throw new ApiError("NETWORK_ERROR", {
      userMessage: USER_MESSAGES.NETWORK_ERROR,
      cause,
    });
  }

  const body = await readEnvelope(res);
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
    const reason = envelope.error.details?.reason;
    const authRejected =
      envelope.error.code === "AUTH_REQUIRED" &&
      auth === true &&
      !AUTH_PATHS.has(path) &&
      // The verification gate reuses AUTH_REQUIRED; that is not a dead token.
      reason !== "email_not_verified";
    if (authRejected && !retried) {
      // Expired in-memory token: refresh once, then retry this exact request.
      // If the tab was already signed out (concurrent 401), never re-mint.
      const refreshed = loadSession() === null ? null : await refreshAccessToken();
      if (refreshed !== null) {
        return apiFetch<T>(path, { ...options, retried: true });
      }
      handleAuthRequired();
    } else if (authRejected && retried) {
      handleAuthRequired();
    }
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
