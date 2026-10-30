import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginUserRequest,
  RegisterUserRequest,
  ResetPasswordRequest,
  User,
  VerifyEmailRequest,
} from "@sda/contracts";
import {
  ForgotPasswordRequestSchema,
  LoginUserRequestSchema,
  RegisterUserRequestSchema,
  ResetPasswordRequestSchema,
  VerifyEmailRequestSchema,
} from "@sda/contracts";
import type { Request, Response } from "express";
import { AppError } from "../common/errors/app-error.js";
import { AuthGuard, OptionalAuthGuard } from "../common/access/auth.guard.js";
import { AuthThrottlerGuard } from "../common/access/auth-throttler.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { readBearerToken } from "../common/access/token.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AuthCookieService } from "./auth-cookie.service.js";
import {
  AuthService,
  toUserDto,
  type IssuedSession,
  type RequestMeta,
} from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post("register")
  @HttpCode(201)
  @UseGuards(AuthThrottlerGuard)
  async register(
    @Body(new ZodValidationPipe(RegisterUserRequestSchema))
    body: RegisterUserRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.accept(await this.auth.register(body), response);
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(LoginUserRequestSchema))
    body: LoginUserRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.accept(await this.auth.login(body), response);
  }

  /** Rotates the refresh cookie; CSRF and Origin are checked before use. */
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    this.cookies.assertCsrf(request);
    const session = await this.auth.refresh(
      this.cookies.readRefreshToken(request),
      requestMeta(request),
    );
    return this.accept(session, response);
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(OptionalAuthGuard)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    const accessToken = readBearerToken(request);
    const refreshToken = this.cookies.readRefreshToken(request);
    if (!accessToken && !refreshToken) {
      throw new AppError(
        "AUTH_REQUIRED",
        "Send a Bearer token or the refresh cookie to log out.",
      );
    }
    // Bearer-only clients have no cookie-authenticated state to forge.
    this.cookies.assertCsrf(request, { allowBearer: true });
    await this.auth.logout(accessToken, refreshToken);
    this.cookies.clearSessionCookies(response);
    return null;
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest): User {
    return toUserDto(requireUser(request));
  }

  @Post("verify-email")
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailRequestSchema))
    body: VerifyEmailRequest,
  ): Promise<null> {
    await this.auth.verifyEmail(body.token);
    return null;
  }

  @Post("resend-verification")
  @HttpCode(200)
  @UseGuards(AuthGuard, AuthThrottlerGuard)
  async resendVerification(@Req() request: AuthRequest): Promise<null> {
    await this.auth.resendVerification(requireUser(request));
    return null;
  }

  /** Always 200: never reveals whether the address is registered. */
  @Post("forgot-password")
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordRequestSchema))
    body: ForgotPasswordRequest,
  ): Promise<null> {
    await this.auth.forgotPassword(body.email);
    return null;
  }

  @Post("reset-password")
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema))
    body: ResetPasswordRequest,
  ): Promise<null> {
    await this.auth.resetPassword(body.token, body.password);
    return null;
  }

  private accept(session: IssuedSession, response: Response): AuthResponse {
    this.cookies.setSessionCookies(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    return session.response;
  }
}

function requestMeta(request: Request): RequestMeta {
  return {
    ...(request.headers["user-agent"]
      ? { userAgent: request.headers["user-agent"] }
      : {}),
    ...(request.ip ? { ip: request.ip } : {}),
  };
}
