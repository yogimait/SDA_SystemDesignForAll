/**
 * Auth-page copy helpers. The shared `USER_MESSAGES` table describes the error
 * code, not the surface: `QUOTA_EXCEEDED` is the auth throttle (429) as well as
 * the generation-rate limit, and the generation wording ("Generation limit
 * reached") is wrong on a sign-in form. Generation flows keep the shared copy;
 * auth pages map that one code to context-neutral copy.
 */
import { ApiError } from "../api/client";

export const AUTH_RATE_LIMITED_MESSAGE =
  "Too many requests. Wait a moment and try again.";

/** Auth-context copy for a rate limit, or null for every other failure. */
export function authRateLimitCopy(error: unknown): string | null {
  return error instanceof ApiError && error.code === "QUOTA_EXCEEDED"
    ? AUTH_RATE_LIMITED_MESSAGE
    : null;
}
