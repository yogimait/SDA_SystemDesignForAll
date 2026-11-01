import type { userProviderCredentials } from "../schema.js";

export type ProviderCredentialRow = typeof userProviderCredentials.$inferSelect;

/** Status listing never loads ciphertext. */
export type ProviderCredentialSummary = Pick<
  ProviderCredentialRow,
  "id" | "provider" | "updatedAt" | "lastUsedAt"
>;

export interface EncryptedCredentialInput {
  id: string;
  userId: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

export interface ProviderCredentialRepository {
  listForUser(userId: string): Promise<ProviderCredentialSummary[]>;
  findForUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<ProviderCredentialRow | null>;
  /** One row per (user, provider); a repeat save rotates the ciphertext. */
  upsert(input: EncryptedCredentialInput): Promise<ProviderCredentialRow>;
  deleteForUserAndProvider(userId: string, provider: string): Promise<boolean>;
  touchLastUsed(id: string, usedAt: Date): Promise<void>;
}

export const PROVIDER_CREDENTIAL_REPOSITORY = Symbol(
  "PROVIDER_CREDENTIAL_REPOSITORY",
);
