import { z } from "zod";
import { UserIdSchema } from "./users.js";

export const ProjectStatusSchema = z.enum([
  "requirements_pending",
  "requirements_ready",
  "requirements_confirmed",
  "architecture_ready",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  idea: z.string().min(1),
  /** Null for anonymous or pre-auth projects; populated after auth ownership lands. */
  ownerId: UserIdSchema.nullable().default(null),
  status: ProjectStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  confirmedAt: z.string().nullable(),
  currentArchitectureVersion: z.number().int().positive().nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectRequestSchema = z.object({
  idea: z.string().trim().min(1).max(8000),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const CreateProjectResponseSchema = z.object({
  project: ProjectSchema,
  /** Returned once at creation. Only the hash is stored server-side. */
  accessKey: z.string().min(16),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

export const StartRunResponseSchema = z.object({
  runId: z.string().min(1),
});
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export const ProjectSummarySchema = z.object({
  id: z.string().min(1),
  idea: z.string().min(1),
  ownerId: UserIdSchema.nullable().default(null),
  status: ProjectStatusSchema,
  confirmedAt: z.string().nullable(),
  currentArchitectureVersion: z.number().int().positive().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ListProjectsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  status: ProjectStatusSchema.optional(),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

export const ListProjectsResponseSchema = z.object({
  projects: z.array(ProjectSummarySchema).max(100),
  nextCursor: z.string().min(1).nullable(),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponseSchema>;
