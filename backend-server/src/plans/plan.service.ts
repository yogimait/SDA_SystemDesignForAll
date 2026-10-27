import { Inject, Injectable } from "@nestjs/common";
import type { PlanTier } from "@sda/contracts";
import { AppError } from "../common/errors/app-error.js";
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
} from "../database/repositories/analytics.repository.js";
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
  type ProjectRow,
} from "../database/repositories/project.repository.js";
import type { UserRow } from "../database/repositories/user.repository.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const PLAN_LIMITS: Record<
  PlanTier,
  { projects: number; runsPer30Days: number; tokensPer30Days: number }
> = {
  free: {
    projects: 3,
    runsPer30Days: 50,
    tokensPer30Days: 500_000,
  },
  pro: {
    projects: 100,
    runsPer30Days: 1_000,
    tokensPer30Days: 10_000_000,
  },
};

@Injectable()
export class PlanService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analytics: AnalyticsRepository,
  ) {}

  async assertCanCreateProject(user: UserRow | undefined): Promise<void> {
    if (!user) return;
    const limits = PLAN_LIMITS[user.planTier];
    const current = await this.projects.countForOwner(user.id);
    if (current >= limits.projects) {
      throw new AppError(
        "PLAN_LIMIT_EXCEEDED",
        `The ${user.planTier} plan allows ${limits.projects} projects. Upgrade to create more.`,
        {
          planTier: user.planTier,
          limitType: "projects",
          limit: limits.projects,
          current,
          upgradeRequired: true,
        },
      );
    }
  }

  async assertCanStartRun(
    user: UserRow | undefined,
    project: ProjectRow,
  ): Promise<void> {
    if (!user || project.ownerId !== user.id) return;
    const limits = PLAN_LIMITS[user.planTier];
    const runs = await this.analytics.listRunsByOwner(
      user.id,
      new Date(Date.now() - THIRTY_DAYS_MS),
    );
    if (runs.length >= limits.runsPer30Days) {
      throw new AppError(
        "PLAN_LIMIT_EXCEEDED",
        `The ${user.planTier} plan allows ${limits.runsPer30Days} generation runs per 30 days. Upgrade to continue.`,
        {
          planTier: user.planTier,
          limitType: "runsPer30Days",
          limit: limits.runsPer30Days,
          current: runs.length,
          upgradeRequired: true,
        },
      );
    }
    const tokens = runs.reduce(
      (sum, run) =>
        sum + run.usagePromptTokens + run.usageCompletionTokens,
      0,
    );
    if (tokens >= limits.tokensPer30Days) {
      throw new AppError(
        "PLAN_LIMIT_EXCEEDED",
        `The ${user.planTier} plan allows ${limits.tokensPer30Days.toLocaleString("en-US")} tokens per 30 days. Upgrade to continue.`,
        {
          planTier: user.planTier,
          limitType: "tokensPer30Days",
          limit: limits.tokensPer30Days,
          current: tokens,
          upgradeRequired: true,
        },
      );
    }
  }

  assertCanRegenerate(
    user: UserRow | undefined,
    project: ProjectRow,
  ): void {
    if (!user || project.ownerId !== user.id) return;
    if (user.planTier === "free") {
      throw new AppError(
        "PLAN_UPGRADE_REQUIRED",
        "Scoped regeneration requires the Pro plan.",
        {
          planTier: user.planTier,
          feature: "scoped_regeneration",
          upgradeRequired: true,
        },
      );
    }
  }
}
