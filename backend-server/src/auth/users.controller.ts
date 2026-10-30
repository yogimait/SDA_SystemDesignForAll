import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { DeleteAccountRequest } from "@sda/contracts";
import { DeleteAccountRequestSchema } from "@sda/contracts";
import type { Response } from "express";
import { AuthGuard } from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AuthCookieService } from "./auth-cookie.service.js";
import { AuthService } from "./auth.service.js";

@Controller("users")
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  /** Deleting the account sets owned projects' owner to NULL (FK) and
   * cascades sessions, tokens, configs, preferences, and subscriptions. */
  @Delete("me")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async deleteAccount(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(DeleteAccountRequestSchema))
    body: DeleteAccountRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    this.cookies.assertCsrf(request);
    await this.auth.deleteAccount(requireUser(request), body.password);
    this.cookies.clearSessionCookies(response);
    return null;
  }
}
