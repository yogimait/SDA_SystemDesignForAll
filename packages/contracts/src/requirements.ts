import { z } from "zod";

/**
 * Requirement identifiers are stable, human-readable and traceable from the
 * canonical architecture model. Server assigns them; clients must preserve them
 * when editing confirmed specifications.
 */
export const RequirementPrioritySchema = z.enum(["must", "should", "could"]);
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

export const FunctionalRequirementSchema = z.object({
  id: z.string().regex(/^fr_[A-Za-z0-9_-]+$/),
  kind: z.literal("functional"),
  text: z.string().trim().min(1).max(500),
  priority: RequirementPrioritySchema,
});
export type FunctionalRequirement = z.infer<typeof FunctionalRequirementSchema>;

export const NonFunctionalCategorySchema = z.enum([
  "performance",
  "scalability",
  "reliability",
  "security",
  "maintainability",
  "usability",
]);
export type NonFunctionalCategory = z.infer<
  typeof NonFunctionalCategorySchema
>;

export const NonFunctionalRequirementSchema = z.object({
  id: z.string().regex(/^nfr_[A-Za-z0-9_-]+$/),
  kind: z.literal("nonfunctional"),
  text: z.string().trim().min(1).max(500),
  priority: RequirementPrioritySchema,
  category: NonFunctionalCategorySchema,
  /** Measurable target when the idea mentions workload, latency, or availability. */
  target: z.string().trim().max(200).default(""),
});
export type NonFunctionalRequirement =
  z.infer<typeof NonFunctionalRequirementSchema>;

export const AssumptionSchema = z.object({
  id: z.string().regex(/^asm_[A-Za-z0-9_-]+$/),
  text: z.string().trim().min(1).max(500),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const ClarificationQuestionSchema = z.object({
  id: z.string().regex(/^q_[A-Za-z0-9_-]+$/),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(1000).optional(),
});
export type ClarificationQuestion =
  z.infer<typeof ClarificationQuestionSchema>;

export const RequirementsSpecSchema = z.object({
  functional: z.array(FunctionalRequirementSchema).min(1).max(30),
  nonFunctional: z.array(NonFunctionalRequirementSchema).max(30),
  assumptions: z.array(AssumptionSchema).max(30),
  clarifications: z.array(ClarificationQuestionSchema).max(30),
});
export type RequirementsSpec = z.infer<typeof RequirementsSpecSchema>;

/** Immutable snapshot used by canonical architecture versions for traceability. */
export const ConfirmedRequirementsSchema = z.object({
  confirmedAt: z.string().min(1),
  spec: RequirementsSpecSchema,
});
export type ConfirmedRequirements = z.infer<typeof ConfirmedRequirementsSchema>;

/**
 * Provider-facing shape of a requirements analysis. IDs are assigned by the
 * backend after validation so the model cannot invent conflicting identifiers.
 */
export const RequirementsAnalysisOutputSchema = z.object({
  functional: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        priority: RequirementPrioritySchema,
      }),
    )
    .min(1)
    .max(30),
  nonFunctional: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        priority: RequirementPrioritySchema,
        category: NonFunctionalCategorySchema,
        target: z.string().trim().max(200).default(""),
      }),
    )
    .max(30),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(30),
  clarifications: z.array(z.string().trim().min(1).max(500)).max(30),
});
export type RequirementsAnalysisOutput = z.infer<
  typeof RequirementsAnalysisOutputSchema
>;

const OptionalFunctionalRequirementSchema = z.object({
  id: z.string().regex(/^fr_[A-Za-z0-9_-]+$/).optional(),
  text: z.string().trim().min(1).max(500),
  priority: RequirementPrioritySchema,
});

const OptionalNonFunctionalRequirementSchema = z.object({
  id: z.string().regex(/^nfr_[A-Za-z0-9_-]+$/).optional(),
  text: z.string().trim().min(1).max(500),
  priority: RequirementPrioritySchema,
  category: NonFunctionalCategorySchema,
  target: z.string().trim().max(200).default(""),
});

const OptionalAssumptionSchema = z.object({
  id: z.string().regex(/^asm_[A-Za-z0-9_-]+$/).optional(),
  text: z.string().trim().min(1).max(500),
});

const OptionalClarificationSchema = z.object({
  id: z.string().regex(/^q_[A-Za-z0-9_-]+$/).optional(),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(1000).optional(),
});

/** Editable spec payload. Existing items keep their ids; new items omit them. */
export const SaveRequirementsRequestSchema = z.object({
  functional: z.array(OptionalFunctionalRequirementSchema).min(1).max(30),
  nonFunctional: z.array(OptionalNonFunctionalRequirementSchema).max(30),
  assumptions: z.array(OptionalAssumptionSchema).max(30),
  clarifications: z.array(OptionalClarificationSchema).max(30),
  confirm: z.boolean(),
});
export type SaveRequirementsRequest = z.infer<
  typeof SaveRequirementsRequestSchema
>;

export const RequirementsResponseSchema = z.object({
  spec: RequirementsSpecSchema.nullable(),
  confirmedAt: z.string().nullable(),
});
export type RequirementsResponse = z.infer<typeof RequirementsResponseSchema>;
