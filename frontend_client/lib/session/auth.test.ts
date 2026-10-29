import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@sda/contracts";
import { AUTH_CHANGED_EVENT, clearSession, loadSession, saveSession } from "./auth";

const AUTH: AuthResponse = {
  user: {
    id: "usr_probe001",
    email: "probe@example.com",
    planTier: "free",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accessToken: "token_test_001",
  tokenType: "Bearer",
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
};

const storage = () => window.sessionStorage;

beforeEach(() => {
  storage().clear();
});

afterEach(() => {
  storage().clear();
});

describe("session store", () => {
  it("saves and loads a live session", () => {
    saveSession(AUTH);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe("token_test_001");
    expect(loaded?.user.email).toBe("probe@example.com");
  });

  it("drops expired sessions on load", () => {
    saveSession({ ...AUTH, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:session")).toBeNull();
  });

  it("rejects malformed stored payloads", () => {
    storage().setItem("sda:auth:session", "{not json");
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:session")).toBeNull();

    storage().setItem("sda:auth:session", JSON.stringify({ accessToken: "x" }));
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:session")).toBeNull();
  });

  it("drops a session whose user shape is invalid", () => {
    storage().setItem(
      "sda:auth:session",
      JSON.stringify({
        accessToken: AUTH.accessToken,
        expiresAt: AUTH.expiresAt,
        user: { id: "usr_1" }, // missing email/planTier/timestamps
      }),
    );
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:session")).toBeNull();
  });

  it("drops a session with an unparsable expiry", () => {
    storage().setItem(
      "sda:auth:session",
      JSON.stringify({ ...AUTH, expiresAt: "not-a-date" }),
    );
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:session")).toBeNull();
  });

  it("clears the session and dispatches the change event", () => {
    saveSession(AUTH);
    const listener = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    clearSession();
    expect(loadSession()).toBeNull();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  });

  it("never exposes the token through localStorage", () => {
    saveSession(AUTH);
    expect(window.localStorage.getItem("sda:auth:session")).toBeNull();
  });
});
