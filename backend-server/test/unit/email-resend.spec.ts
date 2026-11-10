import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { ResendEmailService } from "../../src/auth/email.service.js";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    APP_BASE_URL: "http://localhost:3000",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "SDA <no-reply@example.com>",
    ...overrides,
  } as AppConfig;
}

function response(status: number): Response {
  return new Response(null, { status });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBody(init?: RequestInit): string {
  return typeof init?.body === "string" ? init.body : "";
}

describe("ResendEmailService", () => {
  it("sends a verification link through the Resend HTTP API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const service = new ResendEmailService(config(), async (url, init) => {
      calls.push({ url: requestUrl(url), init: init ?? {} });
      return response(200);
    });

    await service.sendVerification({
      userId: "usr_one",
      email: "one@example.com",
      token: "raw-token-value",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(requestBody(calls[0]?.init)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: "SDA <no-reply@example.com>",
      to: "one@example.com",
      subject: "Verify your email",
    });
    expect(body.text as string).toContain(
      "http://localhost:3000/verify-email?token=raw-token-value",
    );
    expect(body.html as string).toContain("raw-token-value");
  });

  it("maps provider failures without exposing the token", async () => {
    const service = new ResendEmailService(config(), async () => response(503));

    await expect(
      service.sendPasswordReset({
        userId: "usr_one",
        email: "one@example.com",
        token: "raw-token-value",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The email provider rejected the request.",
      details: { provider: "resend", status: 503 },
    });
  });
});
