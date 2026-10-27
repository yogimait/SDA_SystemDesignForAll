import type {
  ProviderSelection,
  ThemePreference,
} from "@sda/contracts";
import type {
  providerConfigs,
  userPreferences,
} from "../schema.js";

export type ProviderConfigRow = typeof providerConfigs.$inferSelect;
export type UserPreferencesRow = typeof userPreferences.$inferSelect;

export interface UserPreferencesInput {
  theme?: ThemePreference;
  defaultProvider?: string;
  defaultModel?: string;
  defaultReasoningEffort?: string;
}

export interface AccountRepository {
  getProviderConfig(userId: string): Promise<ProviderConfigRow | null>;
  saveProviderConfig(
    userId: string,
    selection: ProviderSelection,
  ): Promise<ProviderConfigRow>;
  getPreferences(userId: string): Promise<UserPreferencesRow | null>;
  savePreferences(
    userId: string,
    preferences: UserPreferencesInput,
  ): Promise<UserPreferencesRow>;
}

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
