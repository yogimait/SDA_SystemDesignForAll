import { z } from "zod";

/** Prefix-validated user identifiers keep account references readable. */
export const UserIdSchema = z.string().regex(/^usr_[A-Za-z0-9_-]+$/);
export type UserId = z.infer<typeof UserIdSchema>;

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export type Email = z.infer<typeof EmailSchema>;

export const PASSWORD_PATTERNS = {
  uppercase: /[A-Z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9\s]/,
} as const;

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters" },
  { id: "uppercase", label: "One uppercase letter" },
  { id: "number", label: "One number" },
  { id: "special", label: "One special character" },
] as const;

/** New passwords (register/reset) must satisfy the four visible rules. */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(PASSWORD_PATTERNS.uppercase, "Password must include an uppercase letter.")
  .regex(PASSWORD_PATTERNS.number, "Password must include a number.")
  .regex(
    PASSWORD_PATTERNS.special,
    "Password must include a special character.",
  );
export type Password = z.infer<typeof PasswordSchema>;

/** Existing passwords stay login-compatible after the policy change. */
export const ExistingPasswordSchema = z.string().min(1).max(128);
export type ExistingPassword = z.infer<typeof ExistingPasswordSchema>;

export const PlanTierSchema = z.enum(["free", "pro"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const UserSchema = z.object({
  id: UserIdSchema,
  email: EmailSchema,
  planTier: PlanTierSchema,
  /** Null until the address is confirmed. Optional for older clients. */
  emailVerifiedAt: z.string().min(1).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type User = z.infer<typeof UserSchema>;

export const RegisterUserRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});
export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;

export const LoginUserRequestSchema = z.object({
  email: EmailSchema,
  password: ExistingPasswordSchema,
});
export type LoginUserRequest = z.infer<typeof LoginUserRequestSchema>;

export const AuthResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string().min(1).max(2048),
  tokenType: z.literal("Bearer"),
  expiresAt: z.string().min(1),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Opaque single-use tokens: email verification and password reset. The refresh
 * token is cookie-only and never appears in a body.
 */
export const VerifyEmailRequestSchema = z.object({
  token: z.string().trim().min(16).max(200),
});
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().trim().min(16).max(200),
  password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const DeleteAccountRequestSchema = z.object({
  password: ExistingPasswordSchema,
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

/**
 * Local development only (`GET /api/dev/outbox`): the messages an SMTP
 * transport would have delivered. Disabled when NODE_ENV=production.
 */
export const OutboxMessageSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["email_verification", "password_reset"]),
  recipient: EmailSchema,
  link: z.string().min(1),
  createdAt: z.string().min(1),
});
export type OutboxMessage = z.infer<typeof OutboxMessageSchema>;

export const DevOutboxResponseSchema = z.object({
  messages: z.array(OutboxMessageSchema),
});
export type DevOutboxResponse = z.infer<typeof DevOutboxResponseSchema>;

export const ThemePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const UserPreferencesSchema = z.object({
  theme: ThemePreferenceSchema.optional(),
  defaultProvider: z.string().trim().min(1).max(50).optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  defaultReasoningEffort: z.string().trim().min(1).max(50).optional(),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const SaveUserPreferencesRequestSchema = UserPreferencesSchema;
export type SaveUserPreferencesRequest = z.infer<
  typeof SaveUserPreferencesRequestSchema
>;

export const UserPreferencesResponseSchema = z.object({
  preferences: UserPreferencesSchema,
});
export type UserPreferencesResponse = z.infer<
  typeof UserPreferencesResponseSchema
>;
