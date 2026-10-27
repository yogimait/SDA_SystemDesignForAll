import { describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import { PasswordService } from "../../src/auth/password.service.js";
import type { SessionRow } from "../../src/database/repositories/session.repository.js";
import type { UserRow } from "../../src/database/repositories/user.repository.js";

function makeService() {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();
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
    async updatePlanTier() {
      return null;
    },
  };
  const sessionRepo = {
    async create(input: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      const session: SessionRow = {
        ...input,
        createdAt: new Date(),
      };
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
  };
  const service = new AuthService(
    userRepo as never,
    sessionRepo as never,
    new PasswordService(),
  );
  return { service, users, sessions };
}

describe("AuthService", () => {
  it("registers, logs in, and logs out with opaque hashed sessions", async () => {
    const { service, sessions } = makeService();
    const registered = await service.register({
      email: " User@Example.com ",
      password: "password123",
    });

    expect(registered.user.email).toBe("user@example.com");
    expect(registered.tokenType).toBe("Bearer");
    expect(registered.accessToken.length).toBeGreaterThan(20);
    expect(registered.expiresAt).toBeTruthy();
    expect(sessions.size).toBe(1);
    expect([...sessions.values()][0]?.tokenHash).not.toBe(
      registered.accessToken,
    );

    const loggedIn = await service.login({
      email: "USER@example.com",
      password: "password123",
    });
    expect(loggedIn.user.id).toBe(registered.user.id);
    expect(sessions.size).toBe(2);

    await service.logout(registered.accessToken);
    expect(sessions.size).toBe(1);
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
});
