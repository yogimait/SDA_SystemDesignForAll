import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/env.js";
import { APP_CONFIG } from "../config/config.module.js";
import { AppError } from "../common/errors/app-error.js";
import { readBearerToken } from "../common/access/token.js";

export const REFRESH_COOKIE = "sda_refresh";
export const CSRF_COOKIE = "sda_csrf";
const CSRF_HEADER = "x-csrf-token";

/**
 * Refresh token lives in an httpOnly SameSite=Strict cookie scoped to
 * /api/auth; the CSRF nonce lives in a readable double-submit cookie.
 * Both are Secure in production.
 */
@Injectable()
export class AuthCookieService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  setSessionCookies(
    response: Response,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): string {
    const secure = this.config.NODE_ENV === "production";
    const maxAge = Math.max(0, refreshExpiresAt.getTime() - Date.now());
    response.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/api/auth",
      maxAge,
    });
    const csrfToken = this.createCsrfToken();
    response.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge,
    });
    return csrfToken;
  }

  clearSessionCookies(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    response.clearCookie(CSRF_COOKIE, { path: "/" });
  }

  readRefreshToken(request: Request): string | undefined {
    return readCookie(request, REFRESH_COOKIE);
  }

  /**
   * Origin allowlist plus double-submit token. `allowBearer` keeps Bearer-only
   * clients (no cookie-authenticated state) working for logout.
   */
  assertCsrf(
    request: Request,
    options: { allowBearer?: boolean } = {},
  ): void {
    this.assertOrigin(request);
    const cookieToken = readCookie(request, CSRF_COOKIE);
    if (!cookieToken) {
      if (options.allowBearer && readBearerToken(request)) return;
      return;
    }
    const header = request.headers[CSRF_HEADER];
    const headerToken = Array.isArray(header) ? header[0] : header;
    if (
      !headerToken ||
      !this.verifyCsrfToken(cookieToken) ||
      !safeEqual(headerToken, cookieToken)
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The CSRF token is missing or invalid.",
        { reason: "csrf_invalid" },
      );
    }
  }

  private assertOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (!origin) return;
    const allowed = this.config.CORS_ORIGIN.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.includes(origin)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The request origin is not allowed.",
        { reason: "origin_not_allowed" },
      );
    }
  }

  private createCsrfToken(): string {
    const nonce = randomBytes(32).toString("base64url");
    return this.config.CSRF_SECRET
      ? `${nonce}.${this.sign(nonce)}`
      : nonce;
  }

  private verifyCsrfToken(value: string): boolean {
    if (!this.config.CSRF_SECRET) return true;
    const [nonce, signature] = value.split(".");
    if (!nonce || !signature) return false;
    return safeEqual(signature, this.sign(nonce));
  }

  private sign(nonce: string): string {
    return createHmac("sha256", this.config.CSRF_SECRET ?? "")
      .update(nonce, "utf8")
      .digest("base64url");
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
