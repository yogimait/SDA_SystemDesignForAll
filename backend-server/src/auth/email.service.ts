import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors/app-error.js";
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

export interface EmailService {
  sendVerification(input: SendEmailInput): Promise<void>;
  sendPasswordReset(input: SendEmailInput): Promise<void>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
export const EMAIL_FETCH = Symbol("EMAIL_FETCH");

function buildLink(baseUrl: string, path: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Local development delivery. The outbox stores a usable link so a developer
 * can follow it from GET /api/dev/outbox. Production never persists a raw
 * token, and should use the Resend provider instead.
 */
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
    const production = this.config.NODE_ENV === "production";
    const base = this.config.APP_BASE_URL.replace(/\/$/, "");
    const link = production
      ? `${base}${path}?token=<redacted>`
      : buildLink(this.config.APP_BASE_URL, path, input.token);
    await this.outbox.create({
      id: randomUUID(),
      kind,
      recipient: input.email,
      link,
    });
    this.logger.log(`Queued ${kind} email for user ${input.userId}.`);
    if (production) {
      this.logger.warn(
        "Email delivery is using the outbox in production; configure EMAIL_PROVIDER=resend.",
      );
    }
  }
}

/**
 * Resend HTTP transport. No SDK dependency; failures are mapped to the normal
 * provider-unavailable envelope without exposing the recipient or token.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_FETCH) private readonly fetchFn: typeof fetch,
  ) {}

  async sendVerification(input: SendEmailInput): Promise<void> {
    await this.send(
      "Verify your email",
      "/verify-email",
      input,
      "Confirm your email address to finish setting up your account.",
      "This verification link expires in 24 hours.",
    );
  }

  async sendPasswordReset(input: SendEmailInput): Promise<void> {
    await this.send(
      "Reset your password",
      "/reset-password",
      input,
      "Use this link to choose a new password.",
      "This reset link expires in one hour.",
    );
  }

  private async send(
    subject: string,
    path: string,
    input: SendEmailInput,
    lead: string,
    expiry: string,
  ): Promise<void> {
    const key = this.config.RESEND_API_KEY;
    const from = this.config.EMAIL_FROM;
    if (!key || !from) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Email delivery is not configured.",
      );
    }
    const link = buildLink(this.config.APP_BASE_URL, path, input.token);
    const response = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.email,
        subject,
        text: `${lead}\n\n${link}\n\n${expiry}\n\nIf you did not request this, ignore this email.`,
        html: `<p>${lead}</p><p><a href="${link}">${link}</a></p><p>${expiry}</p><p>If you did not request this, ignore this email.</p>`,
      }),
    });
    if (!response.ok) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The email provider rejected the request.",
        { provider: "resend", status: response.status },
      );
    }
    this.logger.log(`Sent email for user ${input.userId}.`);
  }
}
