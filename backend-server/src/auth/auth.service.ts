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
  hashAccessToken,
  generateAccessToken,
} from "../common/access/token.js";
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../database/repositories/session.repository.js";
import {
  USER_REPOSITORY,
  type UserRepository,
  type UserRow,
} from "../database/repositories/user.repository.js";
import { PasswordService } from "./password.service.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: SessionRepository,
    private readonly passwords: PasswordService,
  ) {}

  async register(request: RegisterUserRequest): Promise<AuthResponse> {
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
    return this.issueSession(user);
  }

  async login(request: LoginUserRequest): Promise<AuthResponse> {
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

  async logout(token: string): Promise<void> {
    await this.sessions.revokeByTokenHash(hashAccessToken(token));
  }

  private async issueSession(user: UserRow): Promise<AuthResponse> {
    const accessToken = generateAccessToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashAccessToken(accessToken),
      expiresAt,
    });
    return {
      user: toUserDto(user),
      accessToken,
      tokenType: "Bearer",
      expiresAt: expiresAt.toISOString(),
    };
  }
}

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    planTier: user.planTier,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newUserId(): string {
  return `usr_${randomUUID().replaceAll("-", "")}`;
}
