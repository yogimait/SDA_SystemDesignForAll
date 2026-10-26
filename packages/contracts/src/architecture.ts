import { z } from "zod";
import { ConfirmedRequirementsSchema } from "./requirements.js";

/** Every canonical element id is prefix-validated so references stay readable. */
export const ArchitectureIdSchemas = {
  class: z.string().regex(/^cls_[A-Za-z0-9_-]+$/),
  relationship: z.string().regex(/^rel_[A-Za-z0-9_-]+$/),
  pattern: z.string().regex(/^pat_[A-Za-z0-9_-]+$/),
  component: z.string().regex(/^cmp_[A-Za-z0-9_-]+$/),
  connection: z.string().regex(/^conn_[A-Za-z0-9_-]+$/),
  flow: z.string().regex(/^flow_[A-Za-z0-9_-]+$/),
  technology: z.string().regex(/^tech_[A-Za-z0-9_-]+$/),
  scalability: z.string().regex(/^scale_[A-Za-z0-9_-]+$/),
  failure: z.string().regex(/^fail_[A-Za-z0-9_-]+$/),
  dsa: z.string().regex(/^dsa_[A-Za-z0-9_-]+$/),
  algorithmicPattern: z.string().regex(/^alg_[A-Za-z0-9_-]+$/),
  learning: z.string().regex(/^step_[A-Za-z0-9_-]+$/),
} as const;

export const RequirementRefSchema = z
  .string()
  .regex(/^(fr|nfr)_[A-Za-z0-9_-]+$/);

export const AlternativeSchema = z.object({
  option: z.string().trim().min(1).max(300),
  rejectedBecause: z.string().trim().min(1).max(500),
});
export type Alternative = z.infer<typeof AlternativeSchema>;

// ---------------------------------------------------------------------------
// LLD
// ---------------------------------------------------------------------------

export const ClassKindSchema = z.enum([
  "class",
  "abstract",
  "interface",
  "enum",
  "value_object",
]);
export type ClassKind = z.infer<typeof ClassKindSchema>;

export const VisibilitySchema = z.enum([
  "public",
  "private",
  "protected",
  "package",
]);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const ClassAttributeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.string().trim().min(1).max(120),
  visibility: VisibilitySchema,
  static: z.boolean().default(false),
  description: z.string().trim().max(300).default(""),
});
export type ClassAttribute = z.infer<typeof ClassAttributeSchema>;

export const ClassMethodSchema = z.object({
  name: z.string().trim().min(1).max(80),
  signature: z.string().trim().min(1).max(300),
  visibility: VisibilitySchema,
  description: z.string().trim().max(300).default(""),
});
export type ClassMethod = z.infer<typeof ClassMethodSchema>;

export const LldClassSchema = z.object({
  id: ArchitectureIdSchemas.class,
  name: z.string().trim().min(1).max(120),
  kind: ClassKindSchema,
  responsibility: z.string().trim().min(1).max(1000),
  requirementRefs: z.array(RequirementRefSchema).max(20).default([]),
  rationale: z.string().trim().min(1).max(700),
  alternatives: z.array(AlternativeSchema).max(5).default([]),
  invariants: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  attributes: z.array(ClassAttributeSchema).max(20).default([]),
  methods: z.array(ClassMethodSchema).max(30).default([]),
});
export type LldClass = z.infer<typeof LldClassSchema>;

export const RelationshipKindSchema = z.enum([
  "inheritance",
  "realization",
  "association",
  "aggregation",
  "composition",
  "dependency",
]);
export type RelationshipKind = z.infer<typeof RelationshipKindSchema>;

export const MultiplicitySchema = z.enum(["1", "0..1", "1..*", "0..*", "*"]);
export type Multiplicity = z.infer<typeof MultiplicitySchema>;

export const LldRelationshipSchema = z.object({
  id: ArchitectureIdSchemas.relationship,
  kind: RelationshipKindSchema,
  sourceId: ArchitectureIdSchemas.class,
  targetId: ArchitectureIdSchemas.class,
  sourceMultiplicity: MultiplicitySchema,
  targetMultiplicity: MultiplicitySchema,
  label: z.string().trim().max(120).default(""),
  rationale: z.string().trim().min(1).max(500),
});
export type LldRelationship = z.infer<typeof LldRelationshipSchema>;

export const DesignPatternCategorySchema = z.enum([
  "creational",
  "structural",
  "behavioral",
]);

export const DesignPatternSchema = z.object({
  id: ArchitectureIdSchemas.pattern,
  name: z.string().trim().min(1).max(120),
  category: DesignPatternCategorySchema,
  participantClassIds: z.array(ArchitectureIdSchemas.class).min(1).max(10),
  requirementRefs: z.array(RequirementRefSchema).max(20).default([]),
  rationale: z.string().trim().min(1).max(700),
  benefits: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  drawbacks: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  simplerAlternative: z.string().trim().min(1).max(500),
  whenUnnecessary: z.string().trim().min(1).max(500),
});
export type DesignPattern = z.infer<typeof DesignPatternSchema>;

export const LldModelSchema = z.object({
  classes: z.array(LldClassSchema).min(1).max(80),
  relationships: z.array(LldRelationshipSchema).max(150),
  patterns: z.array(DesignPatternSchema).max(20).default([]),
});
export type LldModel = z.infer<typeof LldModelSchema>;

// ---------------------------------------------------------------------------
// HLD
// ---------------------------------------------------------------------------

export const ComponentTypeSchema = z.enum([
  "client",
  "gateway",
  "service",
  "store",
  "cache",
  "broker",
  "worker",
  "external",
  "observability",
]);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

export const HldComponentSchema = z.object({
  id: ArchitectureIdSchemas.component,
  name: z.string().trim().min(1).max(120),
  type: ComponentTypeSchema,
  responsibility: z.string().trim().min(1).max(1000),
  technology: z.string().trim().max(200).default(""),
  requirementRefs: z.array(RequirementRefSchema).max(20).default([]),
  scalingNotes: z.string().trim().max(500).default(""),
});
export type HldComponent = z.infer<typeof HldComponentSchema>;

export const ConnectionKindSchema = z.enum(["sync", "async", "data"]);
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>;

export const HldConnectionSchema = z.object({
  id: ArchitectureIdSchemas.connection,
  fromComponentId: ArchitectureIdSchemas.component,
  toComponentId: ArchitectureIdSchemas.component,
  kind: ConnectionKindSchema,
  label: z.string().trim().min(1).max(120),
  protocol: z.string().trim().max(120).default(""),
  rationale: z.string().trim().min(1).max(500),
});
export type HldConnection = z.infer<typeof HldConnectionSchema>;

export const FlowStepSchema = z.object({
  order: z.number().int().positive(),
  description: z.string().trim().min(1).max(500),
  elementRefs: z.array(z.string().min(1)).min(1).max(20),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

export const HldFlowSchema = z.object({
  id: ArchitectureIdSchemas.flow,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  steps: z.array(FlowStepSchema).min(1).max(20),
  requirementRefs: z.array(RequirementRefSchema).max(20).default([]),
});
export type HldFlow = z.infer<typeof HldFlowSchema>;

export const TechnologyDecisionSchema = z.object({
  id: ArchitectureIdSchemas.technology,
  topic: z.string().trim().min(1).max(120),
  choice: z.string().trim().min(1).max(200),
  why: z.string().trim().min(1).max(700),
  limits: z.string().trim().min(1).max(500),
  alternatives: z.array(AlternativeSchema).max(5).default([]),
});
export type TechnologyDecision = z.infer<typeof TechnologyDecisionSchema>;

export const ScalabilityNoteSchema = z.object({
  id: ArchitectureIdSchemas.scalability,
  aspect: z.string().trim().min(1).max(120),
  approach: z.string().trim().min(1).max(500),
  limits: z.string().trim().min(1).max(500),
});
export type ScalabilityNote = z.infer<typeof ScalabilityNoteSchema>;

export const FailureScenarioSchema = z.object({
  id: ArchitectureIdSchemas.failure,
  condition: z.string().trim().min(1).max(300),
  impact: z.string().trim().min(1).max(500),
  mitigation: z.string().trim().min(1).max(500),
  tradeOff: z.string().trim().min(1).max(500),
});
export type FailureScenario = z.infer<typeof FailureScenarioSchema>;

export const HldModelSchema = z.object({
  components: z.array(HldComponentSchema).min(1).max(40),
  connections: z.array(HldConnectionSchema).min(1).max(80),
  flows: z.array(HldFlowSchema).min(1).max(20),
  technologyDecisions: z.array(TechnologyDecisionSchema).max(20).default([]),
  scalabilityNotes: z.array(ScalabilityNoteSchema).max(20).default([]),
  failureScenarios: z.array(FailureScenarioSchema).max(20).default([]),
});
export type HldModel = z.infer<typeof HldModelSchema>;

// ---------------------------------------------------------------------------
// DSA
// ---------------------------------------------------------------------------

export const DsaLayerSchema = z.enum(["lld", "hld", "shared"]);
export type DsaLayer = z.infer<typeof DsaLayerSchema>;

export const ComplexitySchema = z.object({
  average: z.string().trim().min(1).max(120),
  worst: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(300).default(""),
});
export type Complexity = z.infer<typeof ComplexitySchema>;

export const DsaRecommendationSchema = z.object({
  id: ArchitectureIdSchemas.dsa,
  operation: z.string().trim().min(1).max(200),
  layer: DsaLayerSchema,
  dataStructure: z.string().trim().min(1).max(200),
  algorithm: z.string().trim().min(1).max(300),
  complexity: ComplexitySchema,
  rationale: z.string().trim().min(1).max(700),
  requirementRefs: z.array(RequirementRefSchema).max(20).default([]),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  alternatives: z.array(AlternativeSchema).max(5).default([]),
  limitations: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});
export type DsaRecommendation = z.infer<typeof DsaRecommendationSchema>;

export const AlgorithmicPatternSchema = z.object({
  id: ArchitectureIdSchemas.algorithmicPattern,
  name: z.string().trim().min(1).max(120),
  problem: z.string().trim().min(1).max(300),
  approach: z.string().trim().min(1).max(500),
  tradeOffs: z.string().trim().min(1).max(500),
});
export type AlgorithmicPattern = z.infer<typeof AlgorithmicPatternSchema>;

export const DsaModelSchema = z.object({
  recommendations: z.array(DsaRecommendationSchema).min(1).max(40),
  algorithmicPatterns: z.array(AlgorithmicPatternSchema).max(20).default([]),
});
export type DsaModel = z.infer<typeof DsaModelSchema>;

// ---------------------------------------------------------------------------
// Learning + canonical model
// ---------------------------------------------------------------------------

export const LearningStepSchema = z.object({
  id: ArchitectureIdSchemas.learning,
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(900),
  elementRefs: z.array(z.string().min(1)).min(1).max(20),
});
export type LearningStep = z.infer<typeof LearningStepSchema>;

export const ArchitectureMetaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1200),
});

export const ArchitectureModelSchema = z.object({
  meta: ArchitectureMetaSchema,
  requirements: ConfirmedRequirementsSchema,
  lld: LldModelSchema,
  hld: HldModelSchema,
  dsa: DsaModelSchema,
  learningSteps: z.array(LearningStepSchema).min(1).max(30),
});
export type ArchitectureModel = z.infer<typeof ArchitectureModelSchema>;

/** Phase A provider output: HLD only. */
export const HldOutputSchema = HldModelSchema;

/** Phase B provider output: LLD + DSA + learning steps pinned to the HLD. */
export const LldDsaOutputSchema = z.object({
  meta: ArchitectureMetaSchema,
  lld: LldModelSchema,
  dsa: DsaModelSchema,
  learningSteps: z.array(LearningStepSchema).min(1).max(30),
});
export type LldDsaOutput = z.infer<typeof LldDsaOutputSchema>;

// ---------------------------------------------------------------------------
// Validation report
// ---------------------------------------------------------------------------

export const ValidationIssueSchema = z.object({
  rule: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
  path: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationReportSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationIssueSchema),
  warnings: z.array(ValidationIssueSchema),
  validatedAt: z.string().min(1),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export const ArchitectureVersionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.string().min(1),
  model: ArchitectureModelSchema,
  validation: ValidationReportSchema,
});
export type ArchitectureVersion = z.infer<typeof ArchitectureVersionSchema>;

export const GetArchitectureResponseSchema = z.object({
  version: ArchitectureVersionSchema.nullable(),
});
export type GetArchitectureResponse = z.infer<
  typeof GetArchitectureResponseSchema
>;

export const RegenerateScopeSchema = z.enum(["lld", "hld", "dsa"]);
export type RegenerateScope = z.infer<typeof RegenerateScopeSchema>;

export const RegenerateArchitectureRequestSchema = z.object({
  scope: RegenerateScopeSchema,
  provider: z.string().trim().min(1).max(50).optional(),
  model: z.string().trim().min(1).max(200).optional(),
});
export type RegenerateArchitectureRequest = z.infer<
  typeof RegenerateArchitectureRequestSchema
>;
