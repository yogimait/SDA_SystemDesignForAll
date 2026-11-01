import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { loadConfig } from "../../src/config/env.js";
import { CredentialCryptoService } from "../../src/credentials/credential-crypto.service.js";
import { CredentialsService } from "../../src/credentials/credentials.service.js";
import type {
  ProviderCredentialRepository,
  ProviderCredentialRow,
} from "../../src/database/repositories/provider-credential.repository.js";
import type { ProviderRegistry } from "../../src/providers/provider.registry.js";

const USER_ID = "usr_test";

function cryptoService(withKey = true): CredentialCryptoService {
  return new CredentialCryptoService(
    loadConfig({
      NODE_ENV: "test",
      ...(withKey
        ? { CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString("base64") }
        : {}),
    } as NodeJS.ProcessEnv),
  );
}

function storedRow(
  crypto: CredentialCryptoService,
  apiKey = "sk-stored-secret",
): ProviderCredentialRow {
  return {
    id: randomUUID(),
    userId: USER_ID,
    provider: "openrouter",
    ...crypto.encrypt(USER_ID, "openrouter", apiKey),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
  };
}

function serviceWith(row: ProviderCredentialRow | null) {
  const touched: string[] = [];
  const repository = {
    listForUser: async () => [],
    findForUserAndProvider: async () => row,
    upsert: async () => {
      throw new Error("upsert is not used here.");
    },
    deleteForUserAndProvider: async () => false,
    touchLastUsed: async (id: string) => {
      touched.push(id);
    },
  } satisfies ProviderCredentialRepository;
  const providers = {
    list: () => [
      { id: "openrouter", models: [], supportsStructuredOutput: true },
    ],
  } as unknown as ProviderRegistry;
  return { touched, repository, providers };
}

describe("CredentialsService.resolveForRun", () => {
  it("fails loudly when a stored row exists but no encryption key is configured", async () => {
    const { repository, providers } = serviceWith({
      ...storedRow(cryptoService()),
    });
    const service = new CredentialsService(
      repository,
      cryptoService(false),
      providers,
    );

    await expect(
      service.resolveForRun(USER_ID, "openrouter"),
    ).rejects.toMatchObject({ code: "PROVIDER_CREDENTIALS_UNAVAILABLE" });
  });

  it("returns undefined without a row so the env fallback still applies", async () => {
    const { repository, providers } = serviceWith(null);
    const service = new CredentialsService(
      repository,
      cryptoService(false),
      providers,
    );

    await expect(
      service.resolveForRun(USER_ID, "openrouter"),
    ).resolves.toBeUndefined();
  });

  it("ignores an absent authenticated user", async () => {
    const { repository, providers } = serviceWith(storedRow(cryptoService()));
    const service = new CredentialsService(
      repository,
      cryptoService(),
      providers,
    );

    await expect(
      service.resolveForRun(undefined, "openrouter"),
    ).resolves.toBeUndefined();
  });

  it("decrypts for the authenticated user and records the use", async () => {
    const crypto = cryptoService();
    const row = storedRow(crypto);
    const { repository, providers, touched } = serviceWith(row);
    const service = new CredentialsService(repository, crypto, providers);

    await expect(
      service.resolveForRun(USER_ID, "openrouter"),
    ).resolves.toBe("sk-stored-secret");
    expect(touched).toEqual([row.id]);
  });

  it("fails with an opaque code when the stored row was tampered with", async () => {
    const crypto = cryptoService();
    const row = storedRow(crypto);
    const tampered = { ...row, ciphertext: "AAAA" };
    const { repository, providers } = serviceWith(tampered);
    const service = new CredentialsService(repository, crypto, providers);

    await expect(
      service.resolveForRun(USER_ID, "openrouter"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
