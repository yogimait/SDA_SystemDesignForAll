import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  OUTBOX_REPOSITORY,
  type OutboxRepository,
} from "../database/repositories/outbox.repository.js";

export interface SendEmailInput {
  userId: string;
  email: string;
  token: string;
}

/**
 * Email delivery boundary. There is no SMTP transport yet: the outbox
 * implementation stores the link locally so development can read it from
 * `GET /api/dev/outbox`. Tokens are never logged.
 */
export interface EmailService {
  sendVerification(input: SendEmailInput): Promise<void>;
  sendPasswordReset(input: SendEmailInput): Promise<void>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");

@Injectable()
export class OutboxEmailService implements EmailService {
  private readonly logger = new Logger(OutboxEmailService.name);

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async sendVerification(input: SendEmailInput): Promise<void> {
    await this.store("email_verification", "/verify-email", input);
  }

  async sendPasswordReset(input: SendEmailInput): Promise<void> {
    await this.store("password_reset", "/reset-password", input);
  }

  private async store(
    kind: "email_verification" | "password_reset",
    path: string,
    input: SendEmailInput,
  ): Promise<void> {
    const base = this.config.APP_BASE_URL.replace(/\/$/, "");
    const production = this.config.NODE_ENV === "production";
    // The development outbox stores the raw link; production keeps only a
    // placeholder because no delivery transport is configured yet.
    const link = production
      ? `${base}${path}?token=<redacted>`
      : `${base}${path}?token=${encodeURIComponent(input.token)}`;
    await this.outbox.create({
      id: randomUUID(),
      kind,
      recipient: input.email,
      link,
    });
    // Metadata only: the token and link stay out of logs in every environment.
    this.logger.log(`Queued ${kind} email for user ${input.userId}.`);
    if (production) {
      this.logger.warn(
        "Email delivery is not configured; the message was stored without its token.",
      );
    }
  }
}
