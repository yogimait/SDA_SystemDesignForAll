import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { generationRuns, projects } from "../schema.js";
import type {
  AnalyticsRepository,
  AnalyticsRunRow,
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
}
