import { Inject, Injectable } from "@nestjs/common";
import type {
  ProviderSelection,
  SavedProviderConfig,
  SavedProviderConfigResponse,
  SaveUserPreferencesRequest,
  UserPreferences,
  UserPreferencesResponse,
} from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  type ProviderConfigRow,
  type UserPreferencesRow,
} from "../database/repositories/account.repository.js";
import { ProviderRegistry } from "../providers/provider.registry.js";

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly account: AccountRepository,
    private readonly providers: ProviderRegistry,
  ) {}

  async getProviderConfig(userId: string): Promise<SavedProviderConfigResponse> {
    const config = await this.account.getProviderConfig(userId);
    if (!config) {
      throw new AppError("PROVIDER_CONFIG_NOT_FOUND");
    }
    return { config: toProviderConfig(config) };
  }

  async saveProviderConfig(
    userId: string,
    selection: ProviderSelection,
  ): Promise<SavedProviderConfigResponse> {
    this.assertProvider(selection.provider);
    const config = await this.account.saveProviderConfig(userId, selection);
    return { config: toProviderConfig(config) };
  }

  async getPreferences(userId: string): Promise<UserPreferencesResponse> {
    const row = await this.account.getPreferences(userId);
    return { preferences: row ? toPreferences(row) : {} };
  }

  async savePreferences(
    userId: string,
    body: SaveUserPreferencesRequest,
  ): Promise<UserPreferencesResponse> {
    const existing = await this.account.getPreferences(userId);
    const merged = {
      theme: body.theme ?? existing?.theme ?? undefined,
      defaultProvider:
        body.defaultProvider ?? existing?.defaultProvider ?? undefined,
      defaultModel: body.defaultModel ?? existing?.defaultModel ?? undefined,
      defaultReasoningEffort:
        body.defaultReasoningEffort ??
        existing?.defaultReasoningEffort ??
        undefined,
    };
    if (merged.defaultProvider) {
      this.assertProvider(merged.defaultProvider);
    }
    const row = await this.account.savePreferences(userId, merged);
    return { preferences: toPreferences(row) };
  }

  private assertProvider(provider: string): void {
    if (!this.providers.list().some((item) => item.id === provider)) {
      throw new AppError("VALIDATION_ERROR", "Unknown model provider.", {
        provider,
        available: this.providers.list().map((item) => item.id),
      });
    }
  }
}

function toProviderConfig(row: ProviderConfigRow): SavedProviderConfig {
  return {
    provider: row.provider,
    model: row.model,
    ...(row.reasoningEffort ? { reasoningEffort: row.reasoningEffort } : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    ...(row.theme ? { theme: row.theme } : {}),
    ...(row.defaultProvider
      ? { defaultProvider: row.defaultProvider }
      : {}),
    ...(row.defaultModel ? { defaultModel: row.defaultModel } : {}),
    ...(row.defaultReasoningEffort
      ? { defaultReasoningEffort: row.defaultReasoningEffort }
      : {}),
  };
}
