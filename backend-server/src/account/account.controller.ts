import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  SavedProviderConfigResponse,
  SaveProviderConfigRequest,
  SaveUserPreferencesRequest,
  UserPreferencesResponse,
} from "@sda/contracts";
import {
  SaveProviderConfigRequestSchema,
  SaveUserPreferencesRequestSchema,
} from "@sda/contracts";
import { AuthGuard } from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AccountService } from "./account.service.js";

@Controller(["provider-config", "users/me/provider-config"])
@UseGuards(AuthGuard)
export class ProviderConfigController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(
    @Req() request: AuthRequest,
  ): Promise<SavedProviderConfigResponse> {
    return this.account.getProviderConfig(requireUser(request).id);
  }

  @Put()
  save(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(SaveProviderConfigRequestSchema))
    body: SaveProviderConfigRequest,
  ): Promise<SavedProviderConfigResponse> {
    return this.account.saveProviderConfig(requireUser(request).id, body);
  }
}

@Controller(["preferences", "users/me/preferences"])
@UseGuards(AuthGuard)
export class UserPreferencesController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@Req() request: AuthRequest): Promise<UserPreferencesResponse> {
    return this.account.getPreferences(requireUser(request).id);
  }

  @Put()
  save(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(SaveUserPreferencesRequestSchema))
    body: SaveUserPreferencesRequest,
  ): Promise<UserPreferencesResponse> {
    return this.account.savePreferences(requireUser(request).id, body);
  }
}
