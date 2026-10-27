import { z } from "@sda/contracts";

/**
 * Environment contract. Boot fails fast with a readable message when a value is
 * missing or invalid; nothing reads `process.env` outside this module.
 */
const BooleanFlagSchema = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((value) => value === "1" || value === "true");

export const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
    DATABASE_DRIVER: z.enum(["pglite", "postgres"]).default("pglite"),
    PGLITE_DATA_DIR: z.string().trim().min(1).default(".data/pglite"),
    DATABASE_URL: z.string().trim().url().optional(),
    GENERATION_CONCURRENCY: z.coerce.number().int().min(1).default(1),
    GENERATION_POLL_INTERVAL_MS: z.coerce.number().int().min(10).default(100),
    MOCK_PROVIDER: BooleanFlagSchema,
    DEFAULT_PROVIDER: z.string().trim().min(1).default("openrouter"),
    DEFAULT_MODEL: z.string().trim().min(1).default("z-ai/glm-5.3-flash"),
    OPENROUTER_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("z-ai/glm-5.3-flash"),
    GROQ_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("openai/gpt-oss-120b"),
    OPENROUTER_REASONING_EFFORT: z
      .enum(["off", "low", "medium", "high", "max"])
      .default("low"),
    GROQ_REASONING_EFFORT: z
      .enum(["off", "low", "medium", "high"])
      .default("low"),
    // Local development fallback only. The request header wins; production
    // ignores these values. Blank values are treated as unset.
    OPENROUTER_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined)),
    GROQ_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined)),
    MAX_REQUEST_BYTES: z.coerce.number().int().min(1024).default(1_000_000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(10),
    THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(3_600_000),
  })
  .superRefine((value, ctx) => {
    if (value.DATABASE_DRIVER === "postgres" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required when DATABASE_DRIVER=postgres.",
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
