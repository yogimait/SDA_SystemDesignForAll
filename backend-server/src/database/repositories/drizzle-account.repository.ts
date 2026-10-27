import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { providerConfigs, userPreferences } from "../schema.js";
import type {
  AccountRepository,
  ProviderConfigRow,
  UserPreferencesInput,
  UserPreferencesRow,
} from "./account.repository.js";

@Injectable()
export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly database: DatabaseService) {}

  async getProviderConfig(userId: string): Promise<ProviderConfigRow | null> {
    const [config] = await this.database.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.userId, userId))
      .limit(1);
    return config ?? null;
  }

  async saveProviderConfig(
    userId: string,
    selection: {
      provider: string;
      model: string;
      reasoningEffort?: string;
    },
  ): Promise<ProviderConfigRow> {
    const [config] = await this.database.db
      .insert(providerConfigs)
      .values({
        userId,
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort ?? null,
      })
      .onConflictDoUpdate({
        target: providerConfigs.userId,
        set: {
          provider: selection.provider,
          model: selection.model,
          reasoningEffort: selection.reasoningEffort ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  }

  async getPreferences(userId: string): Promise<UserPreferencesRow | null> {
    const [preferences] = await this.database.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return preferences ?? null;
  }

  async savePreferences(
    userId: string,
    preferences: UserPreferencesInput,
  ): Promise<UserPreferencesRow> {
    const [row] = await this.database.db
      .insert(userPreferences)
      .values({
        userId,
        theme: preferences.theme ?? null,
        defaultProvider: preferences.defaultProvider ?? null,
        defaultModel: preferences.defaultModel ?? null,
        defaultReasoningEffort:
          preferences.defaultReasoningEffort ?? null,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          theme: preferences.theme ?? null,
          defaultProvider: preferences.defaultProvider ?? null,
          defaultModel: preferences.defaultModel ?? null,
          defaultReasoningEffort:
            preferences.defaultReasoningEffort ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
