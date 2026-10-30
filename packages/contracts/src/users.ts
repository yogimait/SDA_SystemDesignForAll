import { z } from "zod";

/** Prefix-validated user identifiers keep account references readable. */
export const UserIdSchema = z.string().regex(/^usr_[A-Za-z0-9_-]+$/);
export type UserId = z.infer<typeof UserIdSchema>;

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export type Email = z.infer<typeof EmailSchema>;

export const PasswordSchema = z.string().min(8).max(128);
export type Password = z.infer<typeof PasswordSchema>;

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
  password: PasswordSchema,
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
  password: PasswordSchema,
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
