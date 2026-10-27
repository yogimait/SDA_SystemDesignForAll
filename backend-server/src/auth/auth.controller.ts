import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  AuthResponse,
  LoginUserRequest,
  RegisterUserRequest,
  User,
} from "@sda/contracts";
import {
  LoginUserRequestSchema,
  RegisterUserRequestSchema,
} from "@sda/contracts";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuthGuard } from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { readBearerToken } from "../common/access/token.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AuthService, toUserDto } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  register(
    @Body(new ZodValidationPipe(RegisterUserRequestSchema))
    body: RegisterUserRequest,
  ): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  login(
    @Body(new ZodValidationPipe(LoginUserRequestSchema))
    body: LoginUserRequest,
  ): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest): User {
    return toUserDto(requireUser(request));
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Req() request: AuthRequest): Promise<null> {
    const token = readBearerToken(request);
    if (token) {
      await this.auth.logout(token);
    }
    return null;
  }
}
