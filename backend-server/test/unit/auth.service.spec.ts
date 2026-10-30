import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { PasswordService } from "../../src/auth/password.service.js";
import type {
  EmailVerificationTokenRow,
  PasswordResetTokenRow,
  RefreshTokenRow,
} from "../../src/database/repositories/token.repository.js";
import type { SessionRow } from "../../src/database/repositories/session.repository.js";
import type { UserRow } from "../../src/database/repositories/user.repository.js";

const CONFIG = {
  ACCESS_TOKEN_TTL: 15 * 60 * 1000,
  REFRESH_TOKEN_TTL: 30 * 24 * 60 * 60 * 1000,
} as AppConfig;

function makeService() {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();
  const refreshTokens = new Map<string, RefreshTokenRow>();
  const verificationTokens = new Map<string, EmailVerificationTokenRow>();
  const resetTokens = new Map<string, PasswordResetTokenRow>();
  const sent: { kind: "verification" | "reset"; token: string }[] = [];

  const userRepo = {
    async create(input: {
      id: string;
      email: string;
      passwordHash: string;
      planTier: "free" | "pro";
    }) {
      const now = new Date();
      const user: UserRow = {
        ...input,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      users.set(user.id, user);
      return user;
    },
    async findById(id: string) {
      return users.get(id) ?? null;
    },
    async findByEmail(email: string) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async updatePlanTier(id: string, planTier: "free" | "pro") {
      const user = users.get(id);
      if (!user) return null;
      const updated = { ...user, planTier };
      users.set(id, updated);
      return updated;
    },
    async markEmailVerified(id: string, at: Date) {
      const user = users.get(id);
      if (!user) return null;
      const updated = { ...user, emailVerifiedAt: at };
      users.set(id, updated);
      return updated;
    },
    async updatePasswordHash(id: string, passwordHash: string) {
      const user = users.get(id);
      if (user) users.set(id, { ...user, passwordHash });
    },
    async delete(id: string) {
      users.delete(id);
    },
  };

  const sessionRepo = {
    async create(input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      const session: SessionRow = { ...input, createdAt: new Date() };
      sessions.set(session.id, session);
      return session;
    },
    async findActiveByTokenHash(tokenHash: string, now: Date) {
      return (
        [...sessions.values()].find(
          (session) =>
            session.tokenHash === tokenHash && session.expiresAt > now,
        ) ?? null
      );
    },
    async revokeByTokenHash(tokenHash: string) {
      for (const [id, session] of sessions) {
        if (session.tokenHash === tokenHash) sessions.delete(id);
      }
    },
    async deleteAllForUser(userId: string) {
      for (const [id, session] of sessions) {
        if (session.userId === userId) sessions.delete(id);
      }
    },
  };

  const tokenRepo = {
    async createEmailVerification(input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      const row: EmailVerificationTokenRow = {
        ...input,
        consumedAt: null,
        createdAt: new Date(),
      };
      verificationTokens.set(row.id, row);
      return row;
    },
    async consumeEmailVerification(tokenHash: string, now: Date) {
      for (const row of verificationTokens.values()) {
        if (
          row.tokenHash === tokenHash &&
          !row.consumedAt &&
          row.expiresAt > now
        ) {
          row.consumedAt = now;
          return row;
        }
      }
      return null;
    },
    async deleteEmailVerificationsForUser(userId: string) {
      for (const [id, row] of verificationTokens) {
        if (row.userId === userId) verificationTokens.delete(id);
      }
    },
    async createPasswordReset(input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      const row: PasswordResetTokenRow = {
        ...input,
        consumedAt: null,
        createdAt: new Date(),
      };
      resetTokens.set(row.id, row);
      return row;
    },
    async consumePasswordReset(tokenHash: string, now: Date) {
      for (const row of resetTokens.values()) {
        if (
          row.tokenHash === tokenHash &&
          !row.consumedAt &&
          row.expiresAt > now
        ) {
          row.consumedAt = now;
          return row;
        }
      }
      return null;
    },
    async deletePasswordResetsForUser(userId: string) {
      for (const [id, row] of resetTokens) {
        if (row.userId === userId) resetTokens.delete(id);
      }
    },
    async createRefresh(input: {
      id: string;
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
      userAgent?: string;
      ip?: string;
    }) {
      const row: RefreshTokenRow = {
        ...input,
        revokedAt: null,
        replacedBy: null,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
        createdAt: new Date(),
      };
      refreshTokens.set(row.id, row);
      return row;
    },
    async findRefreshByTokenHash(tokenHash: string) {
      return (
        [...refreshTokens.values()].find((row) => row.tokenHash === tokenHash) ??
        null
      );
    },
    async rotateRefresh(id: string, replacedBy: string, now: Date) {
      const row = refreshTokens.get(id);
      if (!row || row.revokedAt) return false;
      row.revokedAt = now;
      row.replacedBy = replacedBy;
      return true;
    },
    async revokeRefreshFamily(familyId: string, now: Date) {
      for (const row of refreshTokens.values()) {
        if (row.familyId === familyId && !row.revokedAt) row.revokedAt = now;
      }
    },
    async revokeAllRefreshForUser(userId: string, now: Date) {
      for (const row of refreshTokens.values()) {
        if (row.userId === userId && !row.revokedAt) row.revokedAt = now;
      }
    },
  };

  const email = {
    async sendVerification(input: { token: string }) {
      sent.push({ kind: "verification", token: input.token });
    },
    async sendPasswordReset(input: { token: string }) {
      sent.push({ kind: "reset", token: input.token });
    },
  };

  const service = new AuthService(
    CONFIG,
    userRepo as never,
    sessionRepo as never,
    tokenRepo as never,
    email as never,
    new PasswordService(),
  );
  return { service, users, sessions, refreshTokens, sent };
}

describe("AuthService", () => {
  it("registers, logs in, and logs out with opaque hashed sessions", async () => {
    const { service, sessions, refreshTokens, sent } = makeService();
    const registered = await service.register({
      email: " User@Example.com ",
      password: "password123",
    });

    expect(registered.response.user.email).toBe("user@example.com");
    expect(registered.response.tokenType).toBe("Bearer");
    expect(registered.response.accessToken.length).toBeGreaterThan(20);
    expect(registered.response.user.emailVerifiedAt).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sessions.size).toBe(1);
    expect([...sessions.values()][0]?.tokenHash).not.toBe(
      registered.response.accessToken,
    );
    expect(refreshTokens.size).toBe(1);

    const loggedIn = await service.login({
      email: "USER@example.com",
      password: "password123",
    });
    expect(loggedIn.response.user.id).toBe(registered.response.user.id);
    expect(sessions.size).toBe(2);

    await service.logout(
      registered.response.accessToken,
      registered.refreshToken,
    );
    expect(sessions.size).toBe(1);
    const family = [...refreshTokens.values()][0];
    expect(family?.revokedAt).not.toBeNull();
  });

  it("rejects duplicate email and invalid credentials", async () => {
    const { service } = makeService();
    await service.register({
      email: "taken@example.com",
      password: "password123",
    });

    await expect(
      service.register({
        email: "TAKEN@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ code: "AUTH_EMAIL_TAKEN" });

    await expect(
      service.login({
        email: "taken@example.com",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("performs a dummy password verification for an unknown email", async () => {
    const verifyDummy = vi.fn(async () => false);
    const service = new AuthService(
      CONFIG,
      { findByEmail: async () => null } as never,
      {} as never,
      {} as never,
      {} as never,
      { verifyDummy } as never,
    );

    await expect(
      service.login({
        email: "missing@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    expect(verifyDummy).toHaveBeenCalledWith("password123");
  });

  it("rotates the refresh token and revokes the family on reuse", async () => {
    const { service, refreshTokens } = makeService();
    const first = await service.register({
      email: "rotate@example.com",
      password: "password123",
    });

    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.response.accessToken).not.toBe(first.response.accessToken);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      details: { reason: "reuse" },
    });
    // Reuse detection invalidates the whole family, including the new token.
    expect([...refreshTokens.values()].every((row) => row.revokedAt)).toBe(
      true,
    );
    await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
  });

  it("uses password reset tokens once and revokes existing sessions", async () => {
    const { service, sessions, sent } = makeService();
    const registered = await service.register({
      email: "reset@example.com",
      password: "password123",
    });
    await service.forgotPassword("reset@example.com");
    const reset = sent.find((message) => message.kind === "reset");
    expect(reset).toBeDefined();

    await service.resetPassword(reset!.token, "newpassword123");
    expect(sessions.size).toBe(0);
    await expect(
      service.resetPassword(reset!.token, "another123"),
    ).rejects.toMatchObject({ details: { reason: "reset_invalid" } });
    await expect(
      service.login({
        email: "reset@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    const loggedIn = await service.login({
      email: "reset@example.com",
      password: "newpassword123",
    });
    expect(loggedIn.response.user.id).toBe(registered.response.user.id);
  });

  it("consumes verification tokens once and marks the email verified", async () => {
    const { service, users, sent } = makeService();
    const registered = await service.register({
      email: "verify@example.com",
      password: "password123",
    });
    const verification = sent.find(
      (message) => message.kind === "verification",
    );

    await service.verifyEmail(verification!.token);
    const user = users.get(registered.response.user.id);
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(service.verifyEmail(verification!.token)).rejects.toMatchObject(
      { details: { reason: "verification_invalid" } },
    );
  });

  it("requires the correct password before deleting an account", async () => {
    const { service, users } = makeService();
    const registered = await service.register({
      email: "delete@example.com",
      password: "password123",
    });
    const user = users.get(registered.response.user.id)!;

    await expect(
      service.deleteAccount(user, "wrong-password"),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    await service.deleteAccount(user, "password123");
    expect(users.size).toBe(0);
  });
});
