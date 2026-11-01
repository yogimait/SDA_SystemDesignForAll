import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { loadConfig } from "../../src/config/env.js";
import { CredentialCryptoService } from "../../src/credentials/credential-crypto.service.js";

const KEY = randomBytes(32).toString("base64");

function cryptoService(
  overrides: Record<string, string> = {},
): CredentialCryptoService {
  return new CredentialCryptoService(
    loadConfig({
      NODE_ENV: "test",
      CREDENTIALS_ENCRYPTION_KEY: KEY,
      ...overrides,
    } as NodeJS.ProcessEnv),
  );
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error("Expected the call to throw.");
}

function tamper(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytes.toString("base64");
}

describe("CredentialCryptoService", () => {
  it("round-trips a key and binds it to the user and provider", () => {
    const crypto = cryptoService();
    const encrypted = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");

    expect(encrypted.ciphertext).not.toContain("sk-secret-key");
    expect(encrypted.keyVersion).toBe("1");
    expect(
      crypto.decrypt("usr_one", "openrouter", encrypted),
    ).toBe("sk-secret-key");
  });

  it("uses a fresh IV for every encryption", () => {
    const crypto = cryptoService();
    const first = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");
    const second = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext and auth tag", () => {
    const crypto = cryptoService();
    const encrypted = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");

    expect(() =>
      crypto.decrypt("usr_one", "openrouter", {
        ...encrypted,
        ciphertext: tamper(encrypted.ciphertext),
      }),
    ).toThrow(AppError);
    expect(() =>
      crypto.decrypt("usr_one", "openrouter", {
        ...encrypted,
        authTag: tamper(encrypted.authTag),
      }),
    ).toThrow(AppError);
  });

  it("rejects a ciphertext decrypted for another user or provider", () => {
    const crypto = cryptoService();
    const encrypted = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");

    expect(() =>
      crypto.decrypt("usr_two", "openrouter", encrypted),
    ).toThrow(AppError);
    expect(() => crypto.decrypt("usr_one", "groq", encrypted)).toThrow(
      AppError,
    );
  });

  it("rejects an unknown key version", () => {
    const crypto = cryptoService();
    const encrypted = crypto.encrypt("usr_one", "openrouter", "sk-secret-key");

    expect(
      codeOf(() =>
        crypto.decrypt("usr_one", "openrouter", {
          ...encrypted,
          keyVersion: "2",
        }),
      ),
    ).toBe("PROVIDER_CREDENTIALS_UNAVAILABLE");
  });

  it("is disabled without a configured key and encrypts with the current version", () => {
    const disabled = cryptoService({ CREDENTIALS_ENCRYPTION_KEY: "" });
    expect(disabled.enabled).toBe(false);
    expect(() =>
      disabled.encrypt("usr_one", "openrouter", "sk-secret-key"),
    ).toThrow(AppError);
    expect(
      codeOf(() => disabled.encrypt("usr_one", "openrouter", "sk-secret-key")),
    ).toBe("PROVIDER_CREDENTIALS_UNAVAILABLE");

    const rotated = cryptoService({ CREDENTIALS_ENCRYPTION_KEY_VERSION: "2" });
    expect(
      rotated.encrypt("usr_one", "openrouter", "sk-secret-key").keyVersion,
    ).toBe("2");
  });
});
