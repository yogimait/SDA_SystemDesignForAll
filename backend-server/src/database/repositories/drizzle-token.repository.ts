import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import {
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
} from "../schema.js";
import type {
  CreateOpaqueTokenInput,
  CreateRefreshTokenInput,
  EmailVerificationTokenRow,
  PasswordResetTokenRow,
  RefreshTokenRow,
  TokenRepository,
} from "./token.repository.js";

@Injectable()
export class DrizzleTokenRepository implements TokenRepository {
  constructor(private readonly database: DatabaseService) {}

  async createEmailVerification(
    input: CreateOpaqueTokenInput,
  ): Promise<EmailVerificationTokenRow> {
    const [row] = await this.database.db
      .insert(emailVerificationTokens)
      .values(input)
      .returning();
    return row;
  }

  async consumeEmailVerification(
    tokenHash: string,
    now: Date,
  ): Promise<EmailVerificationTokenRow | null> {
    const [row] = await this.database.db
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async deleteEmailVerificationsForUser(userId: string): Promise<void> {
    await this.database.db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }

  async createPasswordReset(
    input: CreateOpaqueTokenInput,
  ): Promise<PasswordResetTokenRow> {
    const [row] = await this.database.db
      .insert(passwordResetTokens)
      .values(input)
      .returning();
    return row;
  }

  async consumePasswordReset(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetTokenRow | null> {
    const [row] = await this.database.db
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async deletePasswordResetsForUser(userId: string): Promise<void> {
    await this.database.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }

  async createRefresh(
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRow> {
    const [row] = await this.database.db
      .insert(refreshTokens)
      .values(input)
      .returning();
    return row;
  }

  async findRefreshByTokenHash(
    tokenHash: string,
  ): Promise<RefreshTokenRow | null> {
    const [row] = await this.database.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async rotateRefresh(
    id: string,
    replacedBy: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.database.db
      .update(refreshTokens)
      .set({ revokedAt: now, replacedBy })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning();
    return rows.length > 0;
  }

  async revokeRefreshFamily(familyId: string, now: Date): Promise<void> {
    await this.database.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)),
      );
  }

  async revokeAllRefreshForUser(userId: string, now: Date): Promise<void> {
    await this.database.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
