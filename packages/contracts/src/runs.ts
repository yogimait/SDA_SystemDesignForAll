import { z } from "zod";
import { ErrorCodeSchema } from "./envelope.js";

export const RunTypeSchema = z.enum(["requirements", "architecture"]);
export type RunType = z.infer<typeof RunTypeSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "interrupted",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const StageStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const RunErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type RunError = z.infer<typeof RunErrorSchema>;

export const GenerationStageSchema = z.object({
  name: z.string().min(1),
  status: StageStatusSchema,
  attempt: z.number().int().min(0),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: RunErrorSchema.nullable(),
  usage: TokenUsageSchema.nullable(),
});
export type GenerationStage = z.infer<typeof GenerationStageSchema>;

export const GenerationRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: RunTypeSchema,
  status: RunStatusSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  scope: z.enum(["lld", "hld", "dsa"]).nullable(),
  stages: z.array(GenerationStageSchema),
  error: RunErrorSchema.nullable(),
  usage: TokenUsageSchema,
  createdAt: z.string().min(1),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type GenerationRun = z.infer<typeof GenerationRunSchema>;

export const RunStreamRunEventSchema = z.object({
  type: z.literal("run"),
  status: RunStatusSchema,
  error: RunErrorSchema.nullable(),
  usage: TokenUsageSchema,
  updatedAt: z.string().min(1),
});
export type RunStreamRunEvent = z.infer<typeof RunStreamRunEventSchema>;

export const RunStreamStageEventSchema = z.object({
  type: z.literal("stage"),
  name: z.string().min(1),
  status: StageStatusSchema,
  attempt: z.number().int().min(0),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: RunErrorSchema.nullable(),
  usage: TokenUsageSchema.nullable(),
});
export type RunStreamStageEvent = z.infer<typeof RunStreamStageEventSchema>;

export const RunStreamHeartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  at: z.string().min(1),
});
export type RunStreamHeartbeatEvent = z.infer<
  typeof RunStreamHeartbeatEventSchema
>;

export const RunStreamEventSchema = z.discriminatedUnion("type", [
  RunStreamRunEventSchema,
  RunStreamStageEventSchema,
  RunStreamHeartbeatEventSchema,
]);
export type RunStreamEvent = z.infer<typeof RunStreamEventSchema>;
export type RunStreamEventType = RunStreamEvent["type"];

/** Optional query fallback for clients that cannot send Last-Event-ID. */
export const RunStreamQuerySchema = z.object({
  lastEventId: z.string().min(1).optional(),
});
export type RunStreamQuery = z.infer<typeof RunStreamQuerySchema>;
