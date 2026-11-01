import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  ProviderCredentialStatusResponse,
  ProviderCredentialsResponse,
  RemoveProviderCredentialResponse,
  SaveProviderCredentialRequest,
} from "@sda/contracts";
import { SaveProviderCredentialRequestSchema } from "@sda/contracts";
import { AuthGuard } from "../common/access/auth.guard.js";
import { AuthThrottlerGuard } from "../common/access/auth-throttler.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AuthCookieService } from "../auth/auth-cookie.service.js";
import { CredentialsService } from "./credentials.service.js";

/** Account-scoped BYOK vault. Responses carry status only, never a key.
 * Reads are unthrottled; writes keep the auth budget because they mutate the
 * vault and are guarded by CSRF. */
@Controller("users/me/provider-keys")
@UseGuards(AuthGuard)
export class ProviderCredentialsController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Get()
  list(@Req() request: AuthRequest): Promise<ProviderCredentialsResponse> {
    return this.credentials.list(requireUser(request).id);
  }

  @Put(":provider")
  @UseGuards(AuthThrottlerGuard)
  save(
    @Req() request: AuthRequest,
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(SaveProviderCredentialRequestSchema))
    body: SaveProviderCredentialRequest,
  ): Promise<ProviderCredentialStatusResponse> {
    this.cookies.assertCsrf(request, { allowBearer: true });
    return this.credentials.save(
      requireUser(request).id,
      provider,
      body.apiKey,
    );
  }

  @Delete(":provider")
  @UseGuards(AuthThrottlerGuard)
  remove(
    @Req() request: AuthRequest,
    @Param("provider") provider: string,
  ): Promise<RemoveProviderCredentialResponse> {
    this.cookies.assertCsrf(request, { allowBearer: true });
    return this.credentials.remove(requireUser(request).id, provider);
  }
}
