import { Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../errors/app-error.js";
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../../database/repositories/session.repository.js";
import {
  USER_REPOSITORY,
  type UserRepository,
  type UserRow,
} from "../../database/repositories/user.repository.js";
import { hashAccessToken, readBearerToken } from "./token.js";

export interface AuthRequest extends Request {
  user?: UserRow;
}

export function requireUser(request: AuthRequest): UserRow {
  if (!request.user) {
    throw new AppError("AUTH_REQUIRED");
  }
  return request.user;
}

@Injectable()
export class AuthContextService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: SessionRepository,
  ) {}

  /** Missing or invalid tokens resolve to null; callers decide the response. */
  async resolveOptional(request: Request): Promise<UserRow | null> {
    const token = readBearerToken(request);
    if (!token) return null;
    const session = await this.sessions.findActiveByTokenHash(
      hashAccessToken(token),
      new Date(),
    );
    if (!session) return null;
    return this.users.findById(session.userId);
  }

  async requireUser(request: Request): Promise<UserRow> {
    if (!readBearerToken(request)) {
      throw new AppError("AUTH_REQUIRED");
    }
    const user = await this.resolveOptional(request);
    if (!user) {
      throw new AppError("AUTH_REQUIRED");
    }
    return user;
  }
}
