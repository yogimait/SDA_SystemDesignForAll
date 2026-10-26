import type {
  ArchitectureModel,
  ConfirmedRequirements,
  ErrorCode,
  ProjectStatus,
  RegenerateScope,
  RunStatus,
  RunType,
  StageStatus,
  ValidationReport,
} from "@sda/contracts";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One schema for both drivers. PGlite (dev/test) and node-postgres (production)
 * run the same generated SQL migrations.
 */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    idea: text("idea").notNull(),
    status: text("status").$type<ProjectStatus>().notNull(),
    requirementsConfirmedAt: timestamp("requirements_confirmed_at", {
      withTimezone: true,
    }),
    requirementsSnapshot: jsonb("requirements_snapshot").$type<ConfirmedRequirements>(),
    currentArchitectureVersion: integer("current_architecture_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("projects_created_at_idx").on(table.createdAt)],
);

export const projectAccess = pgTable("project_access", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const requirements = pgTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"functional" | "nonfunctional">().notNull(),
    text: text("text").notNull(),
    priority: text("priority")
      .$type<"must" | "should" | "could">()
      .notNull(),
    category: text("category").$type<string>(),
    target: text("target").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("requirements_project_idx").on(table.projectId, table.position)],
);

export const assumptions = pgTable(
  "assumptions",
  {
    id: text("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("assumptions_project_idx").on(table.projectId, table.position)],
);

export const clarificationQuestions = pgTable(
  "clarification_questions",
  {
    id: text("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("clarifications_project_idx").on(table.projectId, table.position),
  ],
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").$type<RunType>().notNull(),
    status: text("status").$type<RunStatus>().notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    scope: text("scope").$type<RegenerateScope>(),
    inputHash: text("input_hash").notNull().default(""),
    errorCode: text("error_code").$type<ErrorCode>(),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details").$type<Record<string, unknown>>(),
    usagePromptTokens: integer("usage_prompt_tokens").notNull().default(0),
    usageCompletionTokens: integer("usage_completion_tokens").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runs_one_active_project_idx")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("runs_project_created_idx").on(table.projectId, table.createdAt),
    index("runs_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const generationStages = pgTable(
  "generation_stages",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => generationRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status").$type<StageStatus>().notNull(),
    attempt: integer("attempt").notNull().default(0),
    result: jsonb("result").$type<unknown>(),
    errorCode: text("error_code").$type<ErrorCode>(),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details").$type<Record<string, unknown>>(),
    usagePromptTokens: integer("usage_prompt_tokens").notNull().default(0),
    usageCompletionTokens: integer("usage_completion_tokens")
      .notNull()
      .default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("stages_run_name_idx").on(table.runId, table.name),
    index("stages_run_position_idx").on(table.runId, table.position),
  ],
);

export const architectureVersions = pgTable(
  "architecture_versions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    model: jsonb("model").$type<ArchitectureModel>().notNull(),
    validationReport: jsonb("validation_report")
      .$type<ValidationReport>()
      .notNull(),
    requirementsSnapshot: jsonb("requirements_snapshot")
      .$type<ConfirmedRequirements>()
      .notNull(),
    createdByRunId: uuid("created_by_run_id").references(
      () => generationRuns.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("versions_project_version_idx").on(
      table.projectId,
      table.version,
    ),
    index("versions_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const schema = {
  projects,
  projectAccess,
  requirements,
  assumptions,
  clarificationQuestions,
  generationRuns,
  generationStages,
  architectureVersions,
};
