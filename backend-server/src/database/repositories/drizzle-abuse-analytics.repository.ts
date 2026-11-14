import { Injectable } from "@nestjs/common";
import { count, desc, eq, gte, inArray } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import {
  generationRuns,
  projects,
  users,
} from "../schema.js";
import type {
  AbuseAnalyticsRepository,
  AbuseProjectRow,
  AbuseRunRow,
  AbuseUserRow,
} from "./abuse-analytics.repository.js";

@Injectable()
export class DrizzleAbuseAnalyticsRepository
  implements AbuseAnalyticsRepository
{
  constructor(private readonly database: DatabaseService) {}

  async listUsersSince(from: Date): Promise<AbuseUserRow[]> {
    return this.database.db
      .select({
        id: users.id,
        email: users.email,
        planTier: users.planTier,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(gte(users.createdAt, from))
      .orderBy(desc(users.createdAt));
  }

  async listProjectsSince(from: Date): Promise<AbuseProjectRow[]> {
    return this.database.db
      .select({
        ownerId: projects.ownerId,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(gte(projects.createdAt, from))
      .orderBy(desc(projects.createdAt));
  }

  async listRunsSince(from: Date): Promise<AbuseRunRow[]> {
    return this.database.db
      .select({
        id: generationRuns.id,
        projectId: generationRuns.projectId,
        type: generationRuns.type,
        status: generationRuns.status,
        provider: generationRuns.provider,
        model: generationRuns.model,
        usagePromptTokens: generationRuns.usagePromptTokens,
        usageCompletionTokens: generationRuns.usageCompletionTokens,
        createdAt: generationRuns.createdAt,
        finishedAt: generationRuns.finishedAt,
        ownerId: projects.ownerId,
        ownerEmail: users.email,
        ownerPlanTier: users.planTier,
      })
      .from(generationRuns)
      .innerJoin(projects, eq(projects.id, generationRuns.projectId))
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(gte(generationRuns.createdAt, from))
      .orderBy(desc(generationRuns.createdAt));
  }

  async countUsers(): Promise<number> {
    const [row] = await this.database.db
      .select({ count: count() })
      .from(users);
    return row?.count ?? 0;
  }

  async countActiveRuns(): Promise<number> {
    const [row] = await this.database.db
      .select({ count: count() })
      .from(generationRuns)
      .where(inArray(generationRuns.status, ["queued", "running"]));
    return row?.count ?? 0;
  }
}
