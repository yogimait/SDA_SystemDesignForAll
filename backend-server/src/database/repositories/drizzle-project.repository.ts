import { Injectable } from "@nestjs/common";
import type { NonFunctionalCategory, RequirementsSpec } from "@sda/contracts";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import {
  assumptions,
  clarificationQuestions,
  projectAccess,
  projects,
  requirements,
} from "../schema.js";
import type {
  CreateProjectInput,
  ListProjectsInput,
  ListProjectsResult,
  ProjectPatch,
  ProjectRepository,
  ProjectRow,
  ProjectWithAccess,
} from "./project.repository.js";

@Injectable()
export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateProjectInput): Promise<ProjectRow> {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          id: input.id,
          ownerId: input.ownerId ?? null,
          idea: input.idea,
          status: "requirements_pending",
        })
        .returning();
      await tx.insert(projectAccess).values({
        projectId: input.id,
        keyHash: input.accessKeyHash,
      });
      return project;
    });
  }

  async findById(id: string): Promise<ProjectRow | null> {
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return project ?? null;
  }

  async findWithAccess(id: string): Promise<ProjectWithAccess | null> {
    const [row] = await this.database.db
      .select({
        project: projects,
        keyHash: projectAccess.keyHash,
      })
      .from(projects)
      .innerJoin(projectAccess, eq(projectAccess.projectId, projects.id))
      .where(eq(projects.id, id))
      .limit(1);
    if (!row) {
      return null;
    }
    return { ...row.project, accessKeyHash: row.keyHash };
  }

  async listForOwner(input: ListProjectsInput): Promise<ListProjectsResult> {
    const conditions = [eq(projects.ownerId, input.ownerId)];
    if (input.status) {
      conditions.push(eq(projects.status, input.status));
    }
    if (input.cursor) {
      conditions.push(
        or(
          lt(projects.createdAt, input.cursor.createdAt),
          and(
            eq(projects.createdAt, input.cursor.createdAt),
            lt(projects.id, input.cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.database.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return {
      projects: page,
      nextCursor:
        hasMore && last
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }

  async countForOwner(ownerId: string): Promise<number> {
    const [row] = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.ownerId, ownerId));
    return Number(row?.count ?? 0);
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectRow | null> {
    const [project] = await this.database.db
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project ?? null;
  }
}

@Injectable()
export class DrizzleRequirementsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByProjectId(projectId: string): Promise<RequirementsSpec | null> {
    const [functionalRows, nonFunctionalRows, assumptionRows, questionRows] =
      await Promise.all([
        this.database.db
          .select()
          .from(requirements)
          .where(
            and(
              eq(requirements.projectId, projectId),
              eq(requirements.kind, "functional"),
            ),
          )
          .orderBy(requirements.position),
        this.database.db
          .select()
          .from(requirements)
          .where(
            and(
              eq(requirements.projectId, projectId),
              eq(requirements.kind, "nonfunctional"),
            ),
          )
          .orderBy(requirements.position),
        this.database.db
          .select()
          .from(assumptions)
          .where(eq(assumptions.projectId, projectId))
          .orderBy(assumptions.position),
        this.database.db
          .select()
          .from(clarificationQuestions)
          .where(eq(clarificationQuestions.projectId, projectId))
          .orderBy(clarificationQuestions.position),
      ]);

    if (
      functionalRows.length === 0 &&
      nonFunctionalRows.length === 0 &&
      assumptionRows.length === 0 &&
      questionRows.length === 0
    ) {
      return null;
    }

    return {
      functional: functionalRows.map((row) => ({
        id: row.id,
        kind: "functional",
        text: row.text,
        priority: row.priority,
      })),
      nonFunctional: nonFunctionalRows.map((row) => ({
        id: row.id,
        kind: "nonfunctional",
        text: row.text,
        priority: row.priority,
        category: (row.category ?? "performance") as NonFunctionalCategory,
        target: row.target,
      })),
      assumptions: assumptionRows.map((row) => ({
        id: row.id,
        text: row.text,
      })),
      clarifications: questionRows.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer ?? undefined,
      })),
    };
  }

  async replace(projectId: string, spec: RequirementsSpec): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await tx.delete(requirements).where(eq(requirements.projectId, projectId));
      await tx.delete(assumptions).where(eq(assumptions.projectId, projectId));
      await tx
        .delete(clarificationQuestions)
        .where(eq(clarificationQuestions.projectId, projectId));

      const requirementRows = [
        ...spec.functional.map((item, position) => ({
          id: item.id,
          projectId,
          kind: "functional" as const,
          text: item.text,
          priority: item.priority,
          category: null,
          target: "",
          position,
        })),
        ...spec.nonFunctional.map((item, position) => ({
          id: item.id,
          projectId,
          kind: "nonfunctional" as const,
          text: item.text,
          priority: item.priority,
          category: item.category,
          target: item.target,
          position,
        })),
      ];
      if (requirementRows.length > 0) {
        await tx.insert(requirements).values(requirementRows);
      }
      if (spec.assumptions.length > 0) {
        await tx.insert(assumptions).values(
          spec.assumptions.map((item, position) => ({
            id: item.id,
            projectId,
            text: item.text,
            position,
          })),
        );
      }
      if (spec.clarifications.length > 0) {
        await tx.insert(clarificationQuestions).values(
          spec.clarifications.map((item, position) => ({
            id: item.id,
            projectId,
            question: item.question,
            answer: item.answer ?? null,
            position,
          })),
        );
      }
    });
  }
}
