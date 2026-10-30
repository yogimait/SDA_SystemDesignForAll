import { z } from "@sda/contracts";

/**
 * Environment contract. Boot fails fast with a readable message when a value is
 * missing or invalid; nothing reads `process.env` outside this module.
 */
const BooleanFlagSchema = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((value) => value === "1" || value === "true");

/** Comma-separated model catalog: trimmed, de-duplicated, blanks dropped. */
const ModelListSchema = (fallback: string) =>
  z
    .string()
    .trim()
    .default(fallback)
    .transform((value) => [
      ...new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    ])
    .refine((models) => models.length > 0, {
      message: "At least one model slug is required.",
    });

const DURATION_UNITS_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

/** Accepts `15m`, `30d`, `3600s`, `12h`; returns milliseconds or null. */
export function parseDurationMs(value: string): number | null {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = DURATION_UNITS_MS[match[2] as keyof typeof DURATION_UNITS_MS];
  return amount * unit;
}

/** Token lifetimes are configured as durations and used as milliseconds. */
const DurationSchema = (fallback: string) =>
  z
    .string()
    .trim()
    .default(fallback)
    .transform((value, ctx) => {
      const ms = parseDurationMs(value);
      if (ms === null) {
        ctx.addIssue({
          code: "custom",
          message: "Use a duration such as 15m, 12h, or 30d.",
        });
        return z.NEVER;
      }
      if (ms < 1_000) {
        ctx.addIssue({
          code: "custom",
          message: "The duration must be at least 1s.",
        });
        return z.NEVER;
      }
      return ms;
    });

const OPTIONAL_SECRET = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

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
    OPENROUTER_MODELS: ModelListSchema(
      "z-ai/glm-5.3-flash,anthropic/claude-sonnet-4.5,openai/gpt-5,google/gemini-2.5-pro,deepseek/deepseek-chat",
    ),
    GROQ_MODELS: ModelListSchema(
      "openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant",
    ),
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
    // Auth: short-lived Bearer sessions plus a rotating refresh cookie.
    ACCESS_TOKEN_TTL: DurationSchema("15m"),
    REFRESH_TOKEN_TTL: DurationSchema("30d"),
    REQUIRE_EMAIL_VERIFICATION: BooleanFlagSchema,
    APP_BASE_URL: z.string().trim().url().default("http://localhost:3000"),
    CSRF_SECRET: OPTIONAL_SECRET,
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(5),
    AUTH_THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
    // Stripe is optional. Without a secret key the local stub provider is used.
    STRIPE_SECRET_KEY: OPTIONAL_SECRET,
    STRIPE_WEBHOOK_SECRET: OPTIONAL_SECRET,
    STRIPE_PRICE_PRO: OPTIONAL_SECRET,
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
