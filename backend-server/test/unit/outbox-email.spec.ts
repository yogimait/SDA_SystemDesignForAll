import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { OutboxEmailService } from "../../src/auth/email.service.js";
import type { CreateOutboxMessageInput } from "../../src/database/repositories/outbox.repository.js";

function makeService(nodeEnv: "development" | "test" | "production") {
  const stored: CreateOutboxMessageInput[] = [];
  const outbox = {
    async create(input: CreateOutboxMessageInput) {
      stored.push(input);
      return { ...input, createdAt: new Date() };
    },
    async listRecent() {
      return [];
    },
  };
  const service = new OutboxEmailService(
    outbox as never,
    {
      NODE_ENV: nodeEnv,
      APP_BASE_URL: "http://localhost:3000",
    } as AppConfig,
  );
  return { service, stored };
}

describe("OutboxEmailService", () => {
  it("stores a usable link outside production", async () => {
    const { service, stored } = makeService("development");
    await service.sendVerification({
      userId: "usr_one",
      email: "one@example.com",
      token: "raw-token-value",
    });
    expect(stored[0]?.link).toBe(
      "http://localhost:3000/verify-email?token=raw-token-value",
    );
  });

  it("never persists a raw token in production", async () => {
    const { service, stored } = makeService("production");
    await service.sendPasswordReset({
      userId: "usr_one",
      email: "one@example.com",
      token: "raw-token-value",
    });
    expect(stored[0]?.link).not.toContain("raw-token-value");
    expect(stored[0]?.link).toContain("<redacted>");
  });
});
