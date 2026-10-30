import type {
  ArchitectureModel,
  ConfirmedRequirements,
  ErrorCode,
  PlanTier,
  ProjectStatus,
  RegenerateScope,
  RunStatus,
  RunType,
  StageStatus,
  SubscriptionStatus,
  ValidationReport,
} from "@sda/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
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

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    planTier: text("plan_tier").$type<"free" | "pro">().notNull().default("free"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_verification_token_unique").on(table.tokenHash),
    index("email_verification_user_idx").on(table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_token_unique").on(table.tokenHash),
    index("password_reset_user_idx").on(table.userId),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_unique").on(table.tokenHash),
    index("refresh_tokens_user_idx").on(table.userId),
    index("refresh_tokens_family_idx").on(table.familyId),
  ],
);

export const devOutbox = pgTable(
  "dev_outbox",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<"email_verification" | "password_reset">().notNull(),
    recipient: text("recipient").notNull(),
    link: text("link").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("dev_outbox_created_idx").on(table.createdAt)],
);

export const providerConfigs = pgTable("provider_configs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  reasoningEffort: text("reasoning_effort"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").$type<"system" | "light" | "dark">(),
  defaultProvider: text("default_provider"),
  defaultModel: text("default_model"),
  defaultReasoningEffort: text("default_reasoning_effort"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
  (table) => [
    index("projects_created_at_idx").on(table.createdAt),
    index("projects_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
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

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").$type<PlanTier>().notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    provider: text("provider").$type<"stub" | "stripe">().notNull(),
    customerId: text("customer_id"),
    subscriptionId: text("subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_subscriptions_user_unique").on(table.userId),
    index("billing_subscriptions_external_idx").on(table.subscriptionId),
  ],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey(),
    /** Nullable: provider events may not identify a local user. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"stub" | "stripe">().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_events_idempotency_unique").on(table.idempotencyKey),
    index("billing_events_created_idx").on(table.createdAt),
    index("billing_events_user_idx").on(table.userId),
  ],
);

export const schema = {
  users,
  authSessions,
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
  devOutbox,
  providerConfigs,
  userPreferences,
  billingSubscriptions,
  billingEvents,
  projects,
  projectAccess,
  requirements,
  assumptions,
  clarificationQuestions,
  generationRuns,
  generationStages,
  architectureVersions,
};
