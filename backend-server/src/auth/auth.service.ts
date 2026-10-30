import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthResponse,
  LoginUserRequest,
  RegisterUserRequest,
  User,
} from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import { isEmailConflict } from "../common/errors/database-error.js";
import {
  generateAccessToken,
  hashAccessToken,
} from "../common/access/token.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../database/repositories/session.repository.js";
import {
  TOKEN_REPOSITORY,
  type TokenRepository,
} from "../database/repositories/token.repository.js";
import {
  USER_REPOSITORY,
  type UserRepository,
  type UserRow,
} from "../database/repositories/user.repository.js";
import { EMAIL_SERVICE, type EmailService } from "./email.service.js";
import { PasswordService } from "./password.service.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/** Internal result: the controller puts the refresh token in the cookie. */
export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: SessionRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly passwords: PasswordService,
  ) {}

  async register(request: RegisterUserRequest): Promise<IssuedSession> {
    const email = normalizeEmail(request.email);
    if (await this.users.findByEmail(email)) {
      throw new AppError("AUTH_EMAIL_TAKEN");
    }

    const passwordHash = await this.passwords.hash(request.password);
    let user: UserRow;
    try {
      user = await this.users.create({
        id: newUserId(),
        email,
        passwordHash,
        planTier: "free",
      });
    } catch (error) {
      if (isEmailConflict(error)) {
        throw new AppError("AUTH_EMAIL_TAKEN");
      }
      throw error;
    }
    await this.sendVerification(user);
    return this.issueSession(user);
  }

  async login(request: LoginUserRequest): Promise<IssuedSession> {
    const user = await this.users.findByEmail(normalizeEmail(request.email));
    if (!user) {
      await this.passwords.verifyDummy(request.password);
      throw new AppError("AUTH_INVALID_CREDENTIALS");
    }
    const valid = await this.passwords.verify(
      request.password,
      user.passwordHash,
    );
    if (!valid) {
      throw new AppError("AUTH_INVALID_CREDENTIALS");
    }
    return this.issueSession(user);
  }

  /**
   * Rotates the refresh token. A token that was already rotated (reuse of a
   * stolen cookie) revokes the whole family instead of issuing a new session.
   */
  async refresh(
    rawToken: string | undefined,
    meta: RequestMeta = {},
  ): Promise<IssuedSession> {
    if (!rawToken) {
      throw invalidToken("missing");
    }
    const current = await this.tokens.findRefreshByTokenHash(
      hashAccessToken(rawToken),
    );
    if (!current) {
      throw invalidToken("unknown");
    }
    if (current.revokedAt) {
      await this.tokens.revokeRefreshFamily(current.familyId, new Date());
      throw invalidToken("reuse");
    }
    if (current.expiresAt.getTime() <= Date.now()) {
      throw invalidToken("expired");
    }
    const user = await this.users.findById(current.userId);
    if (!user) {
      throw invalidToken("unknown_user");
    }
    return this.issueSession(user, {
      familyId: current.familyId,
      previousRefreshId: current.id,
      meta,
    });
  }

  async logout(
    accessToken: string | undefined,
    rawRefreshToken: string | undefined,
  ): Promise<void> {
    if (accessToken) {
      await this.sessions.revokeByTokenHash(hashAccessToken(accessToken));
    }
    if (rawRefreshToken) {
      const current = await this.tokens.findRefreshByTokenHash(
        hashAccessToken(rawRefreshToken),
      );
      if (current) {
        await this.tokens.revokeRefreshFamily(current.familyId, new Date());
      }
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.tokens.consumeEmailVerification(
      hashAccessToken(token),
      new Date(),
    );
    if (!consumed) {
      throw invalidToken("verification_invalid");
    }
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw invalidToken("unknown_user");
    }
    await this.users.markEmailVerified(user.id, new Date());
  }

  async resendVerification(user: UserRow): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.tokens.deleteEmailVerificationsForUser(user.id);
    await this.sendVerification(user);
  }

  /** Always resolves: account existence is never revealed by this endpoint. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user) return;
    await this.tokens.deletePasswordResetsForUser(user.id);
    const token = generateAccessToken();
    await this.tokens.createPasswordReset({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashAccessToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await this.email.sendPasswordReset({
      userId: user.id,
      email: user.email,
      token,
    });
  }

  /** Single use: the token is consumed before the password changes. */
  async resetPassword(token: string, password: string): Promise<void> {
    const consumed = await this.tokens.consumePasswordReset(
      hashAccessToken(token),
      new Date(),
    );
    if (!consumed) {
      throw invalidToken("reset_invalid");
    }
    const passwordHash = await this.passwords.hash(password);
    await this.users.updatePasswordHash(consumed.userId, passwordHash);
    await this.tokens.deletePasswordResetsForUser(consumed.userId);
    await this.sessions.deleteAllForUser(consumed.userId);
    await this.tokens.revokeAllRefreshForUser(consumed.userId, new Date());
  }

  /** Deleting the user cascades sessions, tokens, configs, and preferences. */
  async deleteAccount(user: UserRow, password: string): Promise<void> {
    const valid = await this.passwords.verify(password, user.passwordHash);
    if (!valid) {
      throw new AppError("AUTH_INVALID_CREDENTIALS");
    }
    await this.users.delete(user.id);
  }

  private async sendVerification(user: UserRow): Promise<void> {
    const token = generateAccessToken();
    await this.tokens.createEmailVerification({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashAccessToken(token),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
    await this.email.sendVerification({
      userId: user.id,
      email: user.email,
      token,
    });
  }

  private async issueSession(
    user: UserRow,
    options: {
      familyId?: string;
      previousRefreshId?: string;
      meta?: RequestMeta;
    } = {},
  ): Promise<IssuedSession> {
    const now = new Date();
    const accessToken = generateAccessToken();
    const accessExpiresAt = new Date(
      now.getTime() + this.config.ACCESS_TOKEN_TTL,
    );
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashAccessToken(accessToken),
      expiresAt: accessExpiresAt,
    });

    const refreshToken = generateAccessToken();
    const refreshExpiresAt = new Date(
      now.getTime() + this.config.REFRESH_TOKEN_TTL,
    );
    const familyId = options.familyId ?? randomUUID();
    const refreshId = randomUUID();
    await this.tokens.createRefresh({
      id: refreshId,
      userId: user.id,
      tokenHash: hashAccessToken(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: options.meta?.userAgent,
      ip: options.meta?.ip,
    });
    if (options.previousRefreshId) {
      const rotated = await this.tokens.rotateRefresh(
        options.previousRefreshId,
        refreshId,
        now,
      );
      if (!rotated) {
        await this.tokens.revokeRefreshFamily(familyId, now);
        throw invalidToken("reuse");
      }
    }

    return {
      response: {
        user: toUserDto(user),
        accessToken,
        tokenType: "Bearer",
        expiresAt: accessExpiresAt.toISOString(),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    planTier: user.planTier,
    emailVerifiedAt: user.emailVerifiedAt
      ? user.emailVerifiedAt.toISOString()
      : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newUserId(): string {
  return `usr_${randomUUID().replaceAll("-", "")}`;
}

function invalidToken(reason: string): AppError {
  return new AppError(
    "AUTH_INVALID_CREDENTIALS",
    "The token is invalid or has expired.",
    { reason },
  );
}
