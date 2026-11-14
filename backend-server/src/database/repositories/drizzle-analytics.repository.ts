import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { generationRuns, projects } from "../schema.js";
import type {
  AnalyticsRepository,
  AnalyticsRunRow,
  GlobalUsage,
} from "./analytics.repository.js";

@Injectable()
export class DrizzleAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listRunsByOwner(
    ownerId: string,
    from: Date,
  ): Promise<AnalyticsRunRow[]> {
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
      })
      .from(generationRuns)
      .innerJoin(projects, eq(projects.id, generationRuns.projectId))
      .where(
        and(
          eq(projects.ownerId, ownerId),
          gte(generationRuns.createdAt, from),
        ),
      )
      .orderBy(desc(generationRuns.createdAt));
  }

  async sumGlobalUsageSince(from: Date): Promise<GlobalUsage> {
    const [row] = await this.database.db
      .select({
        runCount: sql<number>`count(*)`,
        promptTokens: sql<number>`coalesce(sum(${generationRuns.usagePromptTokens}), 0)`,
        completionTokens: sql<number>`coalesce(sum(${generationRuns.usageCompletionTokens}), 0)`,
      })
      .from(generationRuns)
      .where(gte(generationRuns.createdAt, from));

    return {
      runCount: Number(row?.runCount ?? 0),
      promptTokens: Number(row?.promptTokens ?? 0),
      completionTokens: Number(row?.completionTokens ?? 0),
    };
  }
}
