import { z } from "zod";

/** Per-request model selection. Values resolve against env defaults when omitted. */
export const GenerationOptionsSchema = z.object({
  provider: z.string().trim().min(1).max(50).optional(),
  model: z.string().trim().min(1).max(200).optional(),
});
export type GenerationOptions = z.infer<typeof GenerationOptionsSchema>;

/** Empty body is valid: defaults come from env. */
export const StartRunRequestSchema = GenerationOptionsSchema.default({});
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;

export const ProviderInfoSchema = z.object({
  id: z.string().min(1),
  models: z.array(z.string().min(1)),
  supportsStructuredOutput: z.boolean(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const ProvidersResponseSchema = z.object({
  providers: z.array(ProviderInfoSchema),
  defaultProvider: z.string().min(1),
  defaultModel: z.string().min(1),
  mock: z.boolean(),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;
