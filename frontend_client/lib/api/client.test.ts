import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiEnvelopeSchema, ErrorCodeSchema, ErrorCode } from "@sda/contracts";
import { ApiError, USER_MESSAGES, apiFetch, ensureAccessToken } from "./client";
import { clearSession, loadSession, saveSession } from "../session/auth";

/** Minimal response stub: the client only reads `status` and `json()`. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

const successEnvelope = (statusCode: number, data: unknown) => ({
  status: true,
  statusCode,
  data,
});

const failEnvelope = (
  statusCode: number,
  code: ErrorCode,
  message: string,
) => ({
  status: false,
  statusCode,
  message,
  error: { code },
});

type Stub = { calls: Array<{ url: string; init?: RequestInit }> };

function stubFetch(responses: Response | Error): Stub {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (responses instanceof Error) throw responses;
    return responses;
  });
  vi.stubGlobal("fetch", impl);
  return { calls };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch — success path", () => {
  it("unwraps the envelope data", async () => {
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, [1, 2])));

    const data = await apiFetch<{ items: number[] }>("/api/health");

    expect(data).toEqual([1, 2]);
    expect(stub.calls[0].url).toContain("/api/health");
  });

  it("sends secret headers and content-type, never in the URL", async () => {
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/projects/p_1/architecture", {
      method: "POST",
      body: JSON.stringify({ scope: "lld" }),
      providerKey: "sk-or-test",
      projectKey: "pk_test",
    });

    const init = stub.calls[0].init;
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-provider-api-key"]).toBe("sk-or-test");
    expect(headers["x-project-key"]).toBe("pk_test");
    expect(headers["content-type"]).toBe("application/json");
    expect(stub.calls[0].url).not.toContain("sk-or-test");
    expect(stub.calls[0].url).not.toContain("pk_test");
  });
});

describe("apiFetch — failure paths", () => {
  it("maps a registered error envelope to ApiError with code and message", async () => {
    stubFetch(
      jsonResponse(
        402,
        failEnvelope(402, "QUOTA_EXCEEDED", "Too many runs this hour"),
      ),
    );

    const err = await apiFetch("/api/projects/p_1/architecture").catch((e) => e) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.statusCode).toBe(402);
    expect(err.message).toBe("Too many runs this hour");
    expect(err.userMessage).toBe(USER_MESSAGES.QUOTA_EXCEEDED);
  });

  it("keeps details and flags statusCode/http mismatches", async () => {
    stubFetch(
      jsonResponse(
        500,
        failEnvelope(402, "PROJECT_NOT_FOUND", "gone", ),
      ),
    );

    const err = await apiFetch("/api/projects/p_1").catch((e) => e) as ApiError;

    expect(err.code).toBe("PROJECT_NOT_FOUND");
    expect(err.details).toEqual({
      envelopeStatusCode: 402,
      httpStatus: 500,
    });
  });

  it("rejects when the payload fails the given schema", async () => {
    stubFetch(jsonResponse(200, successEnvelope(200, { notAnId: true })));
    const realZod = (await import("@sda/contracts")).z;
    const schema = realZod.object({ id: realZod.string() });

    const err = await apiFetch<{ id: string }>("/api/projects/p_1", {
      dataSchema: schema,
    } as never).catch((e) => e) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("INVALID_RESPONSE");
    expect(err.statusCode).toBe(200);
  });

  it("maps network failure to NETWORK_ERROR", async () => {
    stubFetch(new Error("ECONNREFUSED"));

    const err = await apiFetch("/api/health").catch((e) => e) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.statusCode).toBeNull();
    expect(err.cause).toBeInstanceOf(Error);
  });

  it("lists every registered code in the user-message map", async () => {
    const contracts = await import("@sda/contracts");
    for (const code of contracts.ErrorCodeSchema.options) {
      expect(USER_MESSAGES[code]).toBeTruthy();
    }
  });

  it("maps non-JSON bodies to INVALID_RESPONSE with the HTTP status", async () => {
    stubFetch({
      status: 502,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    } as unknown as Response);

    const err = await apiFetch("/api/health").catch((e) => e) as ApiError;

    expect(err.code).toBe("INVALID_RESPONSE");
    expect(err.statusCode).toBe(502);
  });

  it("rejects envelopes carrying unregistered codes as INVALID_RESPONSE", async () => {
    stubFetch(
      jsonResponse(500, {
        status: false,
        statusCode: 500,
        message: "boom",
        error: { code: "NOT_A_REGISTERED_CODE" },
      }),
    );

    const err = await apiFetch("/api/health").catch((e) => e) as ApiError;

    expect(err.code).toBe("INVALID_RESPONSE");
    expect(err.statusCode).toBe(500);
  });
});

describe("message mapping table", () => {
  it("covers every registered error code", () => {
    for (const code of ErrorCodeSchema.options) {
      expect(USER_MESSAGES[code], `missing mapping for ${code}`).toBeTruthy();
    }
  });

  it("covers every client-local code and matches the envelope contract", () => {
    expect(USER_MESSAGES.NETWORK_ERROR).toBeTruthy();
    expect(USER_MESSAGES.INVALID_RESPONSE).toBeTruthy();

    // every mapped key must be either a registered code or a client-local code
    const registered = new Set<string>(ErrorCodeSchema.options);
    for (const key of Object.keys(USER_MESSAGES)) {
      expect(
        registered.has(key) || key === "NETWORK_ERROR" || key === "INVALID_RESPONSE",
        `unknown message key ${key}`,
      ).toBe(true);
    }
  });

  it("envelope schema rejects invalid statusCode values", () => {
    expect(
      ApiEnvelopeSchema.safeParse({ status: true, statusCode: 99999, data: null })
        .success,
    ).toBe(false);
  });
});

describe("apiFetch — authenticated sessions", () => {
  const AUTH: import("@sda/contracts").AuthResponse = {
    user: {
      id: "usr_probe001",
      email: "probe@example.com",
      planTier: "free",
      emailVerifiedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    accessToken: "token_test_001",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };

  const REFRESHED: import("@sda/contracts").AuthResponse = {
    ...AUTH,
    accessToken: "token_refreshed_002",
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    clearSession();
  });

  afterEach(() => {
    clearSession();
  });

  it("attaches the Bearer header from the in-memory session", async () => {
    saveSession(AUTH);
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/users/me/dashboard", { auth: true });

    const headers = stub.calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token_test_001");
  });

  it("always sends cookies so the refresh cookie reaches the API", async () => {
    saveSession(AUTH);
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/billing/subscription", { auth: true });

    expect(stub.calls[0].init?.credentials).toBe("include");
  });

  it("sends no Authorization header without a session", async () => {
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/users/me/dashboard", { auth: true });

    const headers = stub.calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it("refreshes once on 401 and retries the original request", async () => {
    saveSession(AUTH);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse(401, failEnvelope(401, "AUTH_REQUIRED", "expired")),
      jsonResponse(200, successEnvelope(200, REFRESHED)),
      jsonResponse(200, successEnvelope(200, { ok: true })),
    ];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return responses.shift() ?? jsonResponse(500, {});
    });

    const data = await apiFetch<{ ok: boolean }>("/api/projects", { auth: true });

    expect(data).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain("/api/auth/refresh");
    const retriedHeaders = calls[2].init?.headers as Record<string, string>;
    expect(retriedHeaders.authorization).toBe("Bearer token_refreshed_002");
  });

  it("signs the tab out when the refresh itself fails", async () => {
    saveSession(AUTH);
    stubFetchSequence([
      jsonResponse(401, failEnvelope(401, "AUTH_REQUIRED", "expired")),
      jsonResponse(401, failEnvelope(401, "AUTH_INVALID_CREDENTIALS", "reuse")),
    ]);

    const err = (await apiFetch("/api/projects", { auth: true }).catch((e) => e)) as ApiError;

    expect(err.code).toBe("AUTH_REQUIRED");
    expect(loadSession()).toBeNull();
    expect(window.sessionStorage.getItem("sda:auth:user")).toBeNull();
  });

  it("refreshes before the request when the in-memory token already expired", async () => {
    saveSession({ ...AUTH, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse(200, successEnvelope(200, REFRESHED)),
      jsonResponse(200, successEnvelope(200, { ok: true })),
    ];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return responses.shift() ?? jsonResponse(500, {});
    });

    await apiFetch("/api/projects", { auth: true });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/api/auth/refresh");
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token_refreshed_002");
  });

  it("does not treat the verification gate as a dead token", async () => {
    saveSession(AUTH);
    const stub = stubFetch(
      jsonResponse(401, {
        status: false,
        statusCode: 401,
        message: "Verify your email first.",
        error: { code: "AUTH_REQUIRED", details: { reason: "email_not_verified" } },
      }),
    );

    const err = (await apiFetch("/api/projects", { auth: true }).catch((e) => e)) as ApiError;

    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.details?.reason).toBe("email_not_verified");
    expect(stub.calls).toHaveLength(1); // no refresh, no retry
    expect(loadSession()).not.toBeNull();
  });

  it("refreshes and restores identity when only the cookies survived (new tab)", async () => {
    document.cookie = "sda_csrf=nonce-tab; path=/";
    clearSession();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return jsonResponse(200, successEnvelope(200, AUTH));
    });

    const token = await ensureAccessToken();

    expect(token).toBe("token_test_001");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/auth/refresh");
    expect(loadSession()?.user.email).toBe("probe@example.com");
    document.cookie = "sda_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("does not attempt a refresh without identity or cookie hint", async () => {
    clearSession();
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await expect(ensureAccessToken()).resolves.toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  it("ignores a stale cookie without identity (no redirect bounce)", async () => {
    document.cookie = "sda_csrf=stale; path=/";
    clearSession();
    vi.stubGlobal("fetch", async () => jsonResponse(401, failEnvelope(401, "AUTH_INVALID_CREDENTIALS", "reuse")));

    await expect(ensureAccessToken()).resolves.toBeNull();
    expect(loadSession()).toBeNull();
    document.cookie = "sda_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("sends x-csrf-token on mutations and not on reads", async () => {
    document.cookie = "sda_csrf=nonce-abc; path=/";
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "pro" }),
    });
    await apiFetch("/api/billing/plans");

    const postHeaders = stub.calls[0].init?.headers as Record<string, string>;
    const getHeaders = stub.calls[1].init?.headers as Record<string, string>;
    expect(postHeaders["x-csrf-token"]).toBe("nonce-abc");
    expect(getHeaders["x-csrf-token"]).toBeUndefined();
    document.cookie = "sda_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
});

/** Sequential fetch stub: each call consumes the next response. */
function stubFetchSequence(responses: Response[]): void {
  vi.stubGlobal("fetch", async () => responses.shift() ?? jsonResponse(500, {}));
}
