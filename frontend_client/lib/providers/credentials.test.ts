import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listProviderCredentials,
  removeProviderCredential,
  saveProviderCredential,
} from "./credentials";

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

const envelope = (data: unknown) => ({ status: true, statusCode: 200, data });

type Call = { url: string; init?: RequestInit };

function stubFetch(body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, body);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("account provider credentials", () => {
  it("lists status only, never a key", async () => {
    const calls = stubFetch(
      envelope({
        credentials: [{ provider: "groq", saved: true, updatedAt: "2026-11-01T00:00:00.000Z" }],
      }),
    );

    const list = await listProviderCredentials();

    expect(list).toEqual([
      { provider: "groq", saved: true, updatedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    expect(calls[0]?.url).toContain("/api/users/me/provider-keys");
    expect(calls[0]?.url).not.toContain("key=");
  });

  it("sends the key once in the PUT body, never the URL", async () => {
    const calls = stubFetch(
      envelope({ credential: { provider: "openrouter", saved: true, updatedAt: "t" } }),
    );

    const credential = await saveProviderCredential("openrouter", "sk-or-test-0123456789");

    expect(credential.saved).toBe(true);
    expect(calls[0]?.url).toContain("/api/users/me/provider-keys/openrouter");
    expect(calls[0]?.url).not.toContain("sk-or-test");
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      apiKey: "sk-or-test-0123456789",
    });
  });

  it("removes a credential and reports whether a row existed", async () => {
    const calls = stubFetch(envelope({ removed: true }));

    await expect(removeProviderCredential("openrouter")).resolves.toBe(true);
    expect(calls[0]?.init?.method).toBe("DELETE");
  });
});
