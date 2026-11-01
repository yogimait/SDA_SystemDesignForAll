import { Inject, Injectable } from "@nestjs/common";
import type {
  ProviderCredentialStatus,
  ProviderCredentialStatusResponse,
  ProviderCredentialsResponse,
  RemoveProviderCredentialResponse,
} from "@sda/contracts";
import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import {
  PROVIDER_CREDENTIAL_REPOSITORY,
  type ProviderCredentialRepository,
  type ProviderCredentialSummary,
} from "../database/repositories/provider-credential.repository.js";
import { ProviderRegistry } from "../providers/provider.registry.js";
import { CredentialCryptoService } from "./credential-crypto.service.js";

/**
 * Account-scoped BYOK vault. Keys are encrypted before they reach the
 * repository, never returned to a client, and never written to logs.
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(PROVIDER_CREDENTIAL_REPOSITORY)
    private readonly repository: ProviderCredentialRepository,
    private readonly crypto: CredentialCryptoService,
    private readonly providers: ProviderRegistry,
  ) {}

  async list(userId: string): Promise<ProviderCredentialsResponse> {
    const rows = await this.repository.listForUser(userId);
    return { credentials: rows.map(toStatus) };
  }

  async save(
    userId: string,
    provider: string,
    apiKey: string,
  ): Promise<ProviderCredentialStatusResponse> {
    this.assertProvider(provider);
    const encrypted = this.crypto.encrypt(userId, provider, apiKey);
    const row = await this.repository.upsert({
      id: randomUUID(),
      userId,
      provider,
      ...encrypted,
    });
    return { credential: toStatus(row) };
  }

  async remove(
    userId: string,
    provider: string,
  ): Promise<RemoveProviderCredentialResponse> {
    this.assertProvider(provider);
    const removed = await this.repository.deleteForUserAndProvider(
      userId,
      provider,
    );
    return { removed };
  }

  /**
   * Run-time precedence: request header > stored credential > registry env
   * fallback (the registry handles the fallback when this returns undefined).
   * A row that exists but cannot be decrypted is an error: silently falling
   * back would hide a rotation or key-configuration mistake.
   */
  async resolveForRun(
    userId: string | undefined,
    provider: string,
  ): Promise<string | undefined> {
    if (!userId) return undefined;
    const row = await this.repository.findForUserAndProvider(userId, provider);
    if (!row) return undefined;
    // decrypt() raises PROVIDER_CREDENTIALS_UNAVAILABLE when no key is set.
    const apiKey = this.crypto.decrypt(userId, provider, row);
    await this.repository.touchLastUsed(row.id, new Date());
    return apiKey;
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

function toStatus(row: ProviderCredentialSummary): ProviderCredentialStatus {
  return {
    provider: row.provider,
    saved: true,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
  };
}
