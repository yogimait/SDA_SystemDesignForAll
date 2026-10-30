import type { authSessions } from "../schema.js";

export type SessionRow = typeof authSessions.$inferSelect;

export interface CreateSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRow>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionRow | null>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
