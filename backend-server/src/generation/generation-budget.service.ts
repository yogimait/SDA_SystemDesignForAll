import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
} from "../database/repositories/analytics.repository.js";

/** Process-wide spend and queue protection for the public hosted key. */
@Injectable()
export class GenerationBudgetService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analytics: AnalyticsRepository,
  ) {}

  async assertCanStart(): Promise<void> {
    if (!this.config.GENERATION_ENABLED) {
      throw new AppError(
        "QUOTA_EXCEEDED",
        "Generation is temporarily paused. Please try again later.",
        { reason: "generation_disabled" },
      );
    }

    const usage = await this.analytics.sumGlobalUsageSince(
      startOfUtcDay(new Date()),
    );
    if (usage.runCount >= this.config.GLOBAL_DAILY_RUN_LIMIT) {
      throw new AppError(
        "QUOTA_EXCEEDED",
        "The daily generation limit has been reached. Please try again tomorrow.",
        {
          reason: "global_daily_run_limit",
          limit: this.config.GLOBAL_DAILY_RUN_LIMIT,
          current: usage.runCount,
        },
      );
    }

    const tokens = usage.promptTokens + usage.completionTokens;
    if (tokens >= this.config.GLOBAL_DAILY_TOKEN_LIMIT) {
      throw new AppError(
        "QUOTA_EXCEEDED",
        "The daily generation budget has been reached. Please try again tomorrow.",
        {
          reason: "global_daily_token_limit",
          limit: this.config.GLOBAL_DAILY_TOKEN_LIMIT,
          current: tokens,
        },
      );
    }
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
}
