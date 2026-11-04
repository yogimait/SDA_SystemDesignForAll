import type { Response } from "express";
import { describe, expect, it } from "vitest";
import { AuthCookieService } from "../../src/auth/auth-cookie.service.js";
import type { AppConfig } from "../../src/config/env.js";

interface CookieCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function responseRecorder() {
  const cookies: CookieCall[] = [];
  const cleared: CookieCall[] = [];
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
      return response;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, value: "", options });
      return response;
    },
  };
  return { response: response as unknown as Response, cookies, cleared };
}

function service(overrides: Partial<AppConfig> = {}): AuthCookieService {
  return new AuthCookieService({
    NODE_ENV: "production",
    COOKIE_DOMAIN: ".nerddog.me",
    CSRF_SECRET: "test-csrf-secret",
    ...overrides,
  } as AppConfig);
}

describe("AuthCookieService cookie domain", () => {
  it("shares refresh and CSRF cookies across subdomains", () => {
    const recorder = responseRecorder();
    service().setSessionCookies(
      recorder.response,
      "refresh-token",
      new Date(Date.now() + 60_000),
    );

    const refresh = recorder.cookies.find((cookie) => cookie.name === "sda_refresh");
    const csrf = recorder.cookies.find((cookie) => cookie.name === "sda_csrf");
    expect(refresh?.options).toMatchObject({
      domain: ".nerddog.me",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/auth",
    });
    expect(csrf?.options).toMatchObject({
      domain: ".nerddog.me",
      httpOnly: false,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  });

  it("clears both host-only and parent-domain cookies", () => {
    const recorder = responseRecorder();
    service().clearSessionCookies(recorder.response);

    expect(recorder.cleared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sda_refresh", options: { path: "/api/auth" } }),
        expect.objectContaining({ name: "sda_csrf", options: { path: "/" } }),
        expect.objectContaining({
          name: "sda_refresh",
          options: { path: "/api/auth", domain: ".nerddog.me" },
        }),
        expect.objectContaining({
          name: "sda_csrf",
          options: { path: "/", domain: ".nerddog.me" },
        }),
      ]),
    );
  });

  it("keeps host-only cookies on localhost when no domain is configured", () => {
    const recorder = responseRecorder();
    service({ COOKIE_DOMAIN: undefined }).setSessionCookies(
      recorder.response,
      "refresh-token",
      new Date(Date.now() + 60_000),
    );

    expect(recorder.cookies[0]?.options.domain).toBeUndefined();
    expect(recorder.cookies[1]?.options.domain).toBeUndefined();
  });
});
