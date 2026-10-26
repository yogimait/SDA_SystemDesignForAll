import { Injectable } from "@nestjs/common";
import type { HldModel } from "@sda/contracts";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database.service.js";
import { generationRuns, generationStages } from "../schema.js";
import type {
  CreateRunInput,
  RunPatch,
  RunRepository,
  RunRow,
  StagePatch,
  StageRow,
} from "./run.repository.js";

@Injectable()
export class DrizzleRunRepository implements RunRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateRunInput): Promise<RunRow> {
    return this.database.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(generationRuns)
        .values({
          id: input.id,
          projectId: input.projectId,
          type: input.type,
          status: "queued",
          provider: input.provider,
          model: input.model,
          scope: input.scope,
          inputHash: input.inputHash,
        })
        .returning();

      if (input.stages.length > 0) {
        await tx.insert(generationStages).values(
          input.stages.map((name, position) => ({
            id: randomUUID(),
            runId: input.id,
            name,
            position,
            status: "pending" as const,
          })),
        );
      }
      return run;
    });
  }

  async findById(id: string): Promise<RunRow | null> {
    const [run] = await this.database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, id))
      .limit(1);
    return run ?? null;
  }

  async listStages(runId: string): Promise<StageRow[]> {
    return this.database.db
      .select()
      .from(generationStages)
      .where(eq(generationStages.runId, runId))
      .orderBy(asc(generationStages.position));
  }

  async claimNextQueued(): Promise<RunRow | null> {
    const [next] = await this.database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.status, "queued"))
      .orderBy(asc(generationRuns.createdAt))
      .limit(1);
    if (!next) {
      return null;
    }

    const [claimed] = await this.database.db
      .update(generationRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(generationRuns.id, next.id),
          eq(generationRuns.status, "queued"),
        ),
      )
      .returning();
    return claimed ?? null;
  }

  async updateRun(id: string, patch: RunPatch): Promise<RunRow | null> {
    const [run] = await this.database.db
      .update(generationRuns)
      .set(patch)
      .where(eq(generationRuns.id, id))
      .returning();
    return run ?? null;
  }

  async updateStage(
    runId: string,
    name: string,
    patch: StagePatch,
  ): Promise<void> {
    await this.database.db
      .update(generationStages)
      .set(patch)
      .where(
        and(
          eq(generationStages.runId, runId),
          eq(generationStages.name, name),
        ),
      );
  }

  async hasActiveRun(projectId: string): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(
        and(
          eq(generationRuns.projectId, projectId),
          inArray(generationRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async reconcileInterrupted(): Promise<number> {
    const running = await this.database.db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(inArray(generationRuns.status, ["queued", "running"]));

    if (running.length === 0) {
      return 0;
    }

    const ids = running.map((row) => row.id);
    const finishedAt = new Date();
    await this.database.db
      .update(generationRuns)
      .set({
        status: "interrupted",
        finishedAt,
        errorCode: "INTERNAL_ERROR",
        errorMessage:
          "Generation was interrupted by a server restart. Start it again.",
        errorDetails: { retryable: true },
      })
      .where(inArray(generationRuns.id, ids));

    await this.database.db
      .update(generationStages)
      .set({
        status: "failed",
        finishedAt,
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Generation was interrupted by a server restart.",
      })
      .where(
        and(
          inArray(generationStages.runId, ids),
          inArray(generationStages.status, ["pending", "running"]),
        ),
      );

    return ids.length;
  }

  async findReusableHld(
    projectId: string,
    inputHash: string,
  ): Promise<HldModel | null> {
    const [row] = await this.database.db
      .select({ result: generationStages.result })
      .from(generationStages)
      .innerJoin(
        generationRuns,
        eq(generationRuns.id, generationStages.runId),
      )
      .where(
        and(
          eq(generationRuns.projectId, projectId),
          eq(generationRuns.type, "architecture"),
          eq(generationRuns.inputHash, inputHash),
          isNull(generationRuns.scope),
          inArray(generationRuns.status, ["failed", "interrupted"]),
          eq(generationStages.name, "hld_model"),
          eq(generationStages.status, "succeeded"),
        ),
      )
      .orderBy(desc(generationRuns.createdAt))
      .limit(1);

    return (row?.result as HldModel | null | undefined) ?? null;
  }
}
