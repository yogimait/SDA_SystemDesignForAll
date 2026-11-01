import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

/**
 * AES-256-GCM for the account-scoped BYOK vault. The AAD is exactly
 * `${userId}:${provider}`, so a row copied to another account or provider
 * fails authentication instead of decrypting.
 */
@Injectable()
export class CredentialCryptoService {
  private readonly key: Buffer | undefined;
  private readonly keyVersion: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = config.CREDENTIALS_ENCRYPTION_KEY
      ? Buffer.from(config.CREDENTIALS_ENCRYPTION_KEY, "base64")
      : undefined;
    this.keyVersion = config.CREDENTIALS_ENCRYPTION_KEY_VERSION;
  }

  get enabled(): boolean {
    return this.key !== undefined;
  }

  encrypt(
    userId: string,
    provider: string,
    apiKey: string,
  ): EncryptedCredential {
    const key = this.key;
    if (!key) throw credentialsUnavailable();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(aad(userId, provider));
    const ciphertext = Buffer.concat([
      cipher.update(apiKey, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: this.keyVersion,
    };
  }

  /** Missing key, unknown version, or failed authentication all resolve to the
   * same opaque error: never surface key material or crypto internals. */
  decrypt(
    userId: string,
    provider: string,
    record: EncryptedCredential,
  ): string {
    const key = this.key;
    if (!key || record.keyVersion !== this.keyVersion) {
      throw credentialsUnavailable();
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(record.iv, "base64"),
      );
      decipher.setAAD(aad(userId, provider));
      decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, "base64")),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch {
      throw credentialsUnavailable();
    }
  }
}

function aad(userId: string, provider: string): Buffer {
  return Buffer.from(`${userId}:${provider}`, "utf8");
}

function credentialsUnavailable(): AppError {
  return new AppError("PROVIDER_CREDENTIALS_UNAVAILABLE");
}
