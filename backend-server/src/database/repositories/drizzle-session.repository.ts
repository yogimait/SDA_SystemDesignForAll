import { Injectable } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { authSessions } from "../schema.js";
import type {
  CreateSessionInput,
  SessionRepository,
  SessionRow,
} from "./session.repository.js";

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const [session] = await this.database.db
      .insert(authSessions)
      .values(input)
      .returning();
    return session;
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionRow | null> {
    const [session] = await this.database.db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          gt(authSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return session ?? null;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.database.db
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash));
  }
}
