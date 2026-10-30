import { z } from "zod";
import { PlanTierSchema } from "./users.js";
import { PlanSchema } from "./plans.js";

/** Provider that owns the subscription. `stub` is local development only. */
export const BillingProviderIdSchema = z.enum(["stub", "stripe"]);
export type BillingProviderId = z.infer<typeof BillingProviderIdSchema>;

export const SubscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingSubscriptionSchema = z.object({
  plan: PlanTierSchema,
  status: SubscriptionStatusSchema,
  provider: BillingProviderIdSchema,
  currentPeriodEnd: z.string().min(1).nullable(),
  cancelAtPeriodEnd: z.boolean(),
  updatedAt: z.string().min(1),
});
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>;

export const BillingPlansResponseSchema = z.object({
  plans: z.array(PlanSchema),
  provider: BillingProviderIdSchema,
  /** True only for the local stub, where the complete-checkout route exists. */
  checkoutCompletable: z.boolean(),
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

export const BillingSubscriptionResponseSchema = z.object({
  subscription: BillingSubscriptionSchema.nullable(),
  planTier: PlanTierSchema,
});
export type BillingSubscriptionResponse = z.infer<
  typeof BillingSubscriptionResponseSchema
>;

/** Only paid plans can be checked out; downgrade is `POST /billing/cancel`. */
export const CheckoutRequestSchema = z.object({ plan: z.literal("pro") });
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  checkoutId: z.string().min(1),
  url: z.string().min(1),
  provider: BillingProviderIdSchema,
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const BillingPortalResponseSchema = z.object({
  url: z.string().min(1),
});
export type BillingPortalResponse = z.infer<typeof BillingPortalResponseSchema>;

export const BillingWebhookResponseSchema = z.object({
  received: z.literal(true),
  /** False when the event id was already recorded (idempotent replay). */
  processed: z.boolean(),
});
export type BillingWebhookResponse = z.infer<
  typeof BillingWebhookResponseSchema
>;
