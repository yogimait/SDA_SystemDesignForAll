import type {
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
} from "../schema.js";

export type EmailVerificationTokenRow =
  typeof emailVerificationTokens.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

export interface CreateOpaqueTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreateRefreshTokenInput extends CreateOpaqueTokenInput {
  familyId: string;
  userAgent?: string;
  ip?: string;
}

export interface TokenRepository {
  createEmailVerification(
    input: CreateOpaqueTokenInput,
  ): Promise<EmailVerificationTokenRow>;
  /** Marks the token consumed and returns it only on the first successful use. */
  consumeEmailVerification(
    tokenHash: string,
    now: Date,
  ): Promise<EmailVerificationTokenRow | null>;
  deleteEmailVerificationsForUser(userId: string): Promise<void>;
  createPasswordReset(
    input: CreateOpaqueTokenInput,
  ): Promise<PasswordResetTokenRow>;
  consumePasswordReset(
    tokenHash: string,
    now: Date,
  ): Promise<PasswordResetTokenRow | null>;
  deletePasswordResetsForUser(userId: string): Promise<void>;
  createRefresh(input: CreateRefreshTokenInput): Promise<RefreshTokenRow>;
  findRefreshByTokenHash(tokenHash: string): Promise<RefreshTokenRow | null>;
  rotateRefresh(id: string, replacedBy: string, now: Date): Promise<boolean>;
  revokeRefreshFamily(familyId: string, now: Date): Promise<void>;
  revokeAllRefreshForUser(userId: string, now: Date): Promise<void>;
}

export const TOKEN_REPOSITORY = Symbol("TOKEN_REPOSITORY");
