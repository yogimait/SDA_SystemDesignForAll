CREATE TABLE "architecture_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"model" jsonb NOT NULL,
	"validation_report" jsonb NOT NULL,
	"requirements_snapshot" jsonb NOT NULL,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumptions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarification_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"scope" text,
	"input_hash" text DEFAULT '' NOT NULL,
	"error_code" text,
	"error_message" text,
	"error_details" jsonb,
	"usage_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"usage_completion_tokens" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generation_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"error_details" jsonb,
	"usage_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"usage_completion_tokens" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_access" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idea" text NOT NULL,
	"status" text NOT NULL,
	"requirements_confirmed_at" timestamp with time zone,
	"requirements_snapshot" jsonb,
	"current_architecture_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"priority" text NOT NULL,
	"category" text,
	"target" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "architecture_versions" ADD CONSTRAINT "architecture_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_versions" ADD CONSTRAINT "architecture_versions_created_by_run_id_generation_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_questions" ADD CONSTRAINT "clarification_questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_stages" ADD CONSTRAINT "generation_stages_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "versions_project_version_idx" ON "architecture_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "versions_project_created_idx" ON "architecture_versions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assumptions_project_idx" ON "assumptions" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "clarifications_project_idx" ON "clarification_questions" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "runs_project_created_idx" ON "generation_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_status_created_idx" ON "generation_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_run_name_idx" ON "generation_stages" USING btree ("run_id","name");--> statement-breakpoint
CREATE INDEX "stages_run_position_idx" ON "generation_stages" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "requirements_project_idx" ON "requirements" USING btree ("project_id","position");