import { Controller, Get, Inject, Injectable } from "@nestjs/common";
import type { DevOutboxResponse } from "@sda/contracts";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../common/errors/app-error.js";
import {
  OUTBOX_REPOSITORY,
  type OutboxRepository,
} from "../database/repositories/outbox.repository.js";

/**
 * Local development inbox for email links. The route is hidden (404) in
 * production because tokens would otherwise be readable over HTTP.
 */
@Injectable()
@Controller("dev/outbox")
export class DevOutboxController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
  ) {}

  @Get()
  async list(): Promise<DevOutboxResponse> {
    if (this.config.NODE_ENV === "production") {
      throw new AppError("ROUTE_NOT_FOUND");
    }
    const messages = await this.outbox.listRecent(50);
    return {
      messages: messages.map((message) => ({
        id: message.id,
        kind: message.kind,
        recipient: message.recipient,
        link: message.link,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }
}
