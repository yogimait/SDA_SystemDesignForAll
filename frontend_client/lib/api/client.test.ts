import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiEnvelopeSchema, ErrorCodeSchema, ErrorCode } from "@sda/contracts";
import { ApiError, USER_MESSAGES, apiFetch } from "./client";

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
    user: { id: "usr_probe001", email: "probe@example.com", planTier: "free", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    accessToken: "token_test_001",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("attaches the Bearer header from the stored session", async () => {
    const { saveSession } = await import("../session/auth");
    saveSession(AUTH);
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/users/me/dashboard", { auth: true });

    const headers = stub.calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token_test_001");
  });

  it("sends no Authorization header without a session", async () => {
    const stub = stubFetch(jsonResponse(200, successEnvelope(200, {})));

    await apiFetch("/api/users/me/dashboard", { auth: true });

    const headers = stub.calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});
