import { z } from "zod";
import { PlanTierSchema } from "./users.js";

/** Shared entitlement limits. Billing and enforcement read the same catalogue. */
export const PlanLimitsSchema = z.object({
  projects: z.number().int().positive(),
  runsPer30Days: z.number().int().positive(),
  tokensPer30Days: z.number().int().positive(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PlanSchema = z.object({
  id: PlanTierSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Placeholder list price; no charge is created by this backend. */
  priceMonthlyUsd: z.number().nonnegative(),
  limits: PlanLimitsSchema,
  features: z.array(z.string().min(1)),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PLAN_CATALOG: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Try the full pipeline on a small number of designs.",
    priceMonthlyUsd: 0,
    limits: { projects: 3, runsPer30Days: 50, tokensPer30Days: 500_000 },
    features: [
      "3 projects",
      "50 generation runs per 30 days",
      "500k model tokens per 30 days",
      "Requirements, HLD, LLD, and DSA generation",
      "Architecture export",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "More projects, more runs, and scoped regeneration.",
    priceMonthlyUsd: 19,
    limits: { projects: 100, runsPer30Days: 1_000, tokensPer30Days: 10_000_000 },
    features: [
      "100 projects",
      "1,000 generation runs per 30 days",
      "10M model tokens per 30 days",
      "Scoped HLD/LLD/DSA regeneration",
      "Architecture export",
    ],
  },
];

export function planById(id: Plan["id"]): Plan {
  const plan = PLAN_CATALOG.find((entry) => entry.id === id);
  if (!plan) {
    throw new Error(`Unknown plan tier "${id}".`);
  }
  return plan;
}
