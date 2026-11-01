import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { userProviderCredentials } from "../schema.js";
import type {
  EncryptedCredentialInput,
  ProviderCredentialRepository,
  ProviderCredentialRow,
  ProviderCredentialSummary,
} from "./provider-credential.repository.js";

@Injectable()
export class DrizzleProviderCredentialRepository
  implements ProviderCredentialRepository
{
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string): Promise<ProviderCredentialSummary[]> {
    return this.database.db
      .select({
        id: userProviderCredentials.id,
        provider: userProviderCredentials.provider,
        updatedAt: userProviderCredentials.updatedAt,
        lastUsedAt: userProviderCredentials.lastUsedAt,
      })
      .from(userProviderCredentials)
      .where(eq(userProviderCredentials.userId, userId))
      .orderBy(userProviderCredentials.provider);
  }

  async findForUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<ProviderCredentialRow | null> {
    const [row] = await this.database.db
      .select()
      .from(userProviderCredentials)
      .where(
        and(
          eq(userProviderCredentials.userId, userId),
          eq(userProviderCredentials.provider, provider),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsert(input: EncryptedCredentialInput): Promise<ProviderCredentialRow> {
    const [row] = await this.database.db
      .insert(userProviderCredentials)
      .values(input)
      .onConflictDoUpdate({
        target: [
          userProviderCredentials.userId,
          userProviderCredentials.provider,
        ],
        set: {
          ciphertext: input.ciphertext,
          iv: input.iv,
          authTag: input.authTag,
          keyVersion: input.keyVersion,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async deleteForUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<boolean> {
    const removed = await this.database.db
      .delete(userProviderCredentials)
      .where(
        and(
          eq(userProviderCredentials.userId, userId),
          eq(userProviderCredentials.provider, provider),
        ),
      )
      .returning();
    return removed.length > 0;
  }

  async touchLastUsed(id: string, usedAt: Date): Promise<void> {
    await this.database.db
      .update(userProviderCredentials)
      .set({ lastUsedAt: usedAt })
      .where(eq(userProviderCredentials.id, id));
  }
}
