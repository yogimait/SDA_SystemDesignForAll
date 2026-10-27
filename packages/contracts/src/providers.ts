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

/**
 * A user-saved provider/model preference. API keys are never stored here:
 * BYOK remains request-scoped through `x-provider-api-key`.
 */
export const ProviderSelectionSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(200),
  reasoningEffort: z.string().trim().min(1).max(50).optional(),
});
export type ProviderSelection = z.infer<typeof ProviderSelectionSchema>;

export const SavedProviderConfigSchema = ProviderSelectionSchema.extend({
  updatedAt: z.string().min(1),
});
export type SavedProviderConfig = z.infer<typeof SavedProviderConfigSchema>;

/** Strict: unknown body keys (an `apiKey`, say) are a VALIDATION_ERROR — BYOK
 * keys must never land in the saved-config endpoint. */
export const SaveProviderConfigRequestSchema = ProviderSelectionSchema.strict();
export type SaveProviderConfigRequest = z.infer<
  typeof SaveProviderConfigRequestSchema
>;

export const SavedProviderConfigResponseSchema = z.object({
  config: SavedProviderConfigSchema,
});
export type SavedProviderConfigResponse = z.infer<
  typeof SavedProviderConfigResponseSchema
>;
