import { z } from "zod";

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
