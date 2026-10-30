import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@sda/contracts";
import {
  AUTH_CHANGED_EVENT,
  clearSession,
  loadSession,
  readCsrfToken,
  saveSession,
  sessionStatus,
  updateSessionUser,
} from "./auth";

const AUTH: AuthResponse = {
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
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
};

const storage = () => window.sessionStorage;

beforeEach(() => {
  storage().clear();
  clearSession();
});

afterEach(() => {
  storage().clear();
  clearSession();
});

describe("session store (memory access token)", () => {
  it("keeps the access token in memory and persists identity only", () => {
    saveSession(AUTH);
    expect(loadSession()?.accessToken).toBe("token_test_001");
    expect(sessionStatus()).toBe("authenticated");

    const persisted = storage().getItem("sda:auth:user");
    expect(persisted).not.toBeNull();
    expect(persisted).not.toContain("token_test_001");
    expect(JSON.parse(persisted as string).user.email).toBe("probe@example.com");
  });

  it("never writes the token to localStorage", () => {
    saveSession(AUTH);
    expect(window.localStorage.getItem("sda:auth:session")).toBeNull();
    expect(window.localStorage.getItem("sda:auth:user")).toBeNull();
  });

  it("returns a pending session after a reload (no token in memory)", () => {
    storage().setItem("sda:auth:user", JSON.stringify({ user: AUTH.user }));
    const session = loadSession();
    expect(session?.user.email).toBe("probe@example.com");
    expect(session?.accessToken).toBe("");
    expect(sessionStatus()).toBe("pending");
  });

  it("migrates the legacy session entry and deletes its access token", () => {
    storage().setItem(
      "sda:auth:session",
      JSON.stringify({ user: AUTH.user, accessToken: "legacy-token", expiresAt: AUTH.expiresAt }),
    );
    const session = loadSession();
    expect(session?.user.email).toBe("probe@example.com");
    expect(session?.accessToken).toBe("");
    expect(storage().getItem("sda:auth:session")).toBeNull();
    expect(storage().getItem("sda:auth:user")).not.toContain("legacy-token");
  });

  it("treats an expired in-memory token as pending, not signed out", () => {
    saveSession({ ...AUTH, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(sessionStatus()).toBe("pending");
    expect(loadSession()?.accessToken).toBe("");
  });

  it("drops malformed identity entries", () => {
    storage().setItem("sda:auth:user", "{not json");
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:user")).toBeNull();

    storage().setItem("sda:auth:user", JSON.stringify({ user: { id: "usr_1" } }));
    expect(loadSession()).toBeNull();
  });

  it("updates identity fields (plan tier) without touching the token", () => {
    saveSession(AUTH);
    updateSessionUser({ ...AUTH.user, planTier: "pro", emailVerifiedAt: "2026-01-02T00:00:00.000Z" });
    expect(loadSession()?.user.planTier).toBe("pro");
    expect(loadSession()?.accessToken).toBe("token_test_001");
  });

  it("clears the session, identity, and dispatches the change event", () => {
    saveSession(AUTH);
    const listener = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    clearSession();
    expect(loadSession()).toBeNull();
    expect(storage().getItem("sda:auth:user")).toBeNull();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  });
});

describe("csrf cookie", () => {
  afterEach(() => {
    document.cookie = "sda_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("reads the double-submit nonce", () => {
    expect(readCsrfToken()).toBeNull();
    document.cookie = "sda_csrf=nonce-123; path=/";
    expect(readCsrfToken()).toBe("nonce-123");
  });
});
