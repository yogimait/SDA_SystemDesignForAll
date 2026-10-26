import type {
  ArchitectureModel,
  ConfirmedRequirements,
  DsaModel,
  HldModel,
  LearningStep,
  LldClass,
  LldModel,
  RequirementsSpec,
  ValidationIssue,
  ValidationReport,
} from "@sda/contracts";

type Severity = ValidationIssue["severity"];

class Collector {
  readonly issues: ValidationIssue[] = [];

  add(
    severity: Severity,
    rule: string,
    message: string,
    path?: string,
  ): void {
    this.issues.push({
      rule,
      severity,
      message,
      ...(path ? { path } : {}),
    });
  }

  error(rule: string, message: string, path?: string): void {
    this.add("error", rule, message, path);
  }

  warn(rule: string, message: string, path?: string): void {
    this.add("warning", rule, message, path);
  }

  result(): ValidationResult {
    return {
      errors: this.issues.filter((issue) => issue.severity === "error"),
      warnings: this.issues.filter(
        (issue) => issue.severity === "warning",
      ),
    };
  }
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function toValidationReport(result: ValidationResult): ValidationReport {
  return {
    valid: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings,
    validatedAt: new Date().toISOString(),
  };
}

function requirementIds(spec: RequirementsSpec): Set<string> {
  return new Set([
    ...spec.functional.map((item) => item.id),
    ...spec.nonFunctional.map((item) => item.id),
  ]);
}

function checkUniqueIds(
  items: Array<{ id: string }>,
  label: string,
  collector: Collector,
  basePath: string,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      collector.error(
        "duplicate_id",
        `Duplicate ${label} id "${item.id}".`,
        `${basePath}[${index}].id`,
      );
    }
    seen.add(item.id);
  });
}

function checkRequirementRefs(
  refs: string[],
  known: Set<string>,
  collector: Collector,
  path: string,
): void {
  refs.forEach((ref, index) => {
    if (!known.has(ref)) {
      collector.error(
        "unknown_requirement_ref",
        `Requirement reference "${ref}" does not exist in the confirmed spec.`,
        `${path}[${index}]`,
      );
    }
  });
}

function validateLld(
  lld: LldModel,
  spec: RequirementsSpec,
  collector: Collector,
): void {
  const known = requirementIds(spec);
  checkUniqueIds(lld.classes, "class", collector, "lld.classes");
  checkUniqueIds(
    lld.relationships,
    "relationship",
    collector,
    "lld.relationships",
  );
  checkUniqueIds(lld.patterns, "pattern", collector, "lld.patterns");

  const classes = new Map(lld.classes.map((item) => [item.id, item]));
  const nameCounts = new Map<string, number>();
  for (const item of lld.classes) {
    nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1);
    checkRequirementRefs(
      item.requirementRefs,
      known,
      collector,
      `lld.classes(${item.id}).requirementRefs`,
    );
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      collector.warn(
        "duplicate_class_name",
        `Class name "${name}" is used ${count} times.`,
        "lld.classes",
      );
    }
  }

  lld.relationships.forEach((relationship, index) => {
    const path = `lld.relationships[${index}]`;
    const source = classes.get(relationship.sourceId);
    const target = classes.get(relationship.targetId);
    if (!source) {
      collector.error(
        "unknown_relationship_endpoint",
        `Relationship source "${relationship.sourceId}" is not a class.`,
        `${path}.sourceId`,
      );
    }
    if (!target) {
      collector.error(
        "unknown_relationship_endpoint",
        `Relationship target "${relationship.targetId}" is not a class.`,
        `${path}.targetId`,
      );
    }
    if (!source || !target) {
      return;
    }

    if (
      relationship.kind === "inheritance" &&
      (!isClassLike(source) ||
        !isClassLike(target) ||
        source.id === target.id)
    ) {
      collector.error(
        "relationship_kind_mismatch",
        "Inheritance requires two distinct class or abstract-class endpoints.",
        path,
      );
    }
    if (
      relationship.kind === "realization" &&
      (target.kind !== "interface" || source.kind === "interface")
    ) {
      collector.error(
        "relationship_kind_mismatch",
        "Realization requires a class-like source and an interface target.",
        path,
      );
    }
    if (
      ["aggregation", "composition"].includes(relationship.kind) &&
      (!isStructuralEndpoint(source) || !isStructuralEndpoint(target))
    ) {
      collector.error(
        "relationship_kind_mismatch",
        `${relationship.kind} endpoints must be classes, abstract classes, or value objects.`,
        path,
      );
    }
    if (
      ["inheritance", "realization"].includes(relationship.kind) &&
      (relationship.sourceMultiplicity !== "1" ||
        relationship.targetMultiplicity !== "1")
    ) {
      collector.error(
        "relationship_multiplicity_mismatch",
        `${relationship.kind} uses multiplicity "1" on both ends.`,
        path,
      );
    }
    if (
      ["aggregation", "composition"].includes(relationship.kind) &&
      !["1", "0..1"].includes(relationship.sourceMultiplicity)
    ) {
      collector.error(
        "relationship_multiplicity_mismatch",
        `${relationship.kind} requires the whole (source) to be "1" or "0..1".`,
        path,
      );
    }
  });

  lld.patterns.forEach((pattern) => {
    for (const classId of pattern.participantClassIds) {
      if (!classes.has(classId)) {
        collector.error(
          "unknown_pattern_participant",
          `Pattern participant "${classId}" is not a class.`,
          `lld.patterns(${pattern.id}).participantClassIds`,
        );
      }
    }
    checkRequirementRefs(
      pattern.requirementRefs,
      known,
      collector,
      `lld.patterns(${pattern.id}).requirementRefs`,
    );
  });

  if (lld.classes.length < 1) {
    collector.warn(
      "minimal_lld",
      "The LLD has no classes.",
      "lld.classes",
    );
  }
}

function isClassLike(item: LldClass): boolean {
  return item.kind === "class" || item.kind === "abstract";
}

function isStructuralEndpoint(item: LldClass): boolean {
  return (
    item.kind === "class" ||
    item.kind === "abstract" ||
    item.kind === "value_object"
  );
}

function validateHld(
  hld: HldModel,
  spec: RequirementsSpec,
  collector: Collector,
): void {
  const known = requirementIds(spec);
  checkUniqueIds(hld.components, "component", collector, "hld.components");
  checkUniqueIds(
    hld.connections,
    "connection",
    collector,
    "hld.connections",
  );
  checkUniqueIds(hld.flows, "flow", collector, "hld.flows");
  checkUniqueIds(
    hld.technologyDecisions,
    "technology decision",
    collector,
    "hld.technologyDecisions",
  );
  checkUniqueIds(
    hld.scalabilityNotes,
    "scalability note",
    collector,
    "hld.scalabilityNotes",
  );
  checkUniqueIds(
    hld.failureScenarios,
    "failure scenario",
    collector,
    "hld.failureScenarios",
  );

  const componentIds = new Set(hld.components.map((item) => item.id));
  const connectionIds = new Set(hld.connections.map((item) => item.id));
  const nameCounts = new Map<string, number>();

  hld.components.forEach((component) => {
    nameCounts.set(component.name, (nameCounts.get(component.name) ?? 0) + 1);
    checkRequirementRefs(
      component.requirementRefs,
      known,
      collector,
      `hld.components(${component.id}).requirementRefs`,
    );
  });
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      collector.warn(
        "duplicate_component_name",
        `Component name "${name}" is used ${count} times.`,
        "hld.components",
      );
    }
  }

  hld.connections.forEach((connection, index) => {
    const path = `hld.connections[${index}]`;
    if (!componentIds.has(connection.fromComponentId)) {
      collector.error(
        "unknown_connection_endpoint",
        `Connection source "${connection.fromComponentId}" does not exist.`,
        `${path}.fromComponentId`,
      );
    }
    if (!componentIds.has(connection.toComponentId)) {
      collector.error(
        "unknown_connection_endpoint",
        `Connection target "${connection.toComponentId}" does not exist.`,
        `${path}.toComponentId`,
      );
    }
    if (connection.fromComponentId === connection.toComponentId) {
      collector.error(
        "self_connection",
        "A component cannot connect to itself.",
        path,
      );
    }
  });

  hld.flows.forEach((flow) => {
    checkRequirementRefs(
      flow.requirementRefs,
      known,
      collector,
      `hld.flows(${flow.id}).requirementRefs`,
    );
    const orders = new Set<number>();
    flow.steps.forEach((step, index) => {
      if (orders.has(step.order)) {
        collector.warn(
          "duplicate_flow_order",
          `Flow "${flow.id}" has more than one step with order ${step.order}.`,
          `hld.flows(${flow.id}).steps[${index}].order`,
        );
      }
      orders.add(step.order);
      step.elementRefs.forEach((ref, refIndex) => {
        if (!componentIds.has(ref) && !connectionIds.has(ref)) {
          collector.error(
            "unknown_flow_ref",
            `Flow step reference "${ref}" is not a component or connection.`,
            `hld.flows(${flow.id}).steps[${index}].elementRefs[${refIndex}]`,
          );
        }
      });
    });
  });

  if (hld.components.length < 1) {
    collector.warn("minimal_hld", "The HLD has no components.", "hld.components");
  }
  if (hld.connections.length < 1) {
    collector.warn(
      "minimal_hld",
      "The HLD has no connections.",
      "hld.connections",
    );
  }
}

function validateDsa(
  dsa: DsaModel,
  spec: RequirementsSpec,
  collector: Collector,
): void {
  const known = requirementIds(spec);
  checkUniqueIds(
    dsa.recommendations,
    "DSA recommendation",
    collector,
    "dsa.recommendations",
  );
  checkUniqueIds(
    dsa.algorithmicPatterns,
    "algorithmic pattern",
    collector,
    "dsa.algorithmicPatterns",
  );

  dsa.recommendations.forEach((recommendation) => {
    checkRequirementRefs(
      recommendation.requirementRefs,
      known,
      collector,
      `dsa.recommendations(${recommendation.id}).requirementRefs`,
    );
    if (recommendation.complexity.average.trim().length === 0) {
      collector.error(
        "missing_complexity",
        "Average-case complexity is missing.",
        `dsa.recommendations(${recommendation.id}).complexity.average`,
      );
    }
    if (recommendation.complexity.worst.trim().length === 0) {
      collector.error(
        "missing_complexity",
        "Worst-case complexity is missing.",
        `dsa.recommendations(${recommendation.id}).complexity.worst`,
      );
    }
  });
}

export function collectElementIds(model: ArchitectureModel): Set<string> {
  return new Set([
    ...model.lld.classes.map((item) => item.id),
    ...model.lld.relationships.map((item) => item.id),
    ...model.lld.patterns.map((item) => item.id),
    ...model.hld.components.map((item) => item.id),
    ...model.hld.connections.map((item) => item.id),
    ...model.hld.flows.map((item) => item.id),
    ...model.hld.technologyDecisions.map((item) => item.id),
    ...model.hld.scalabilityNotes.map((item) => item.id),
    ...model.hld.failureScenarios.map((item) => item.id),
    ...model.dsa.recommendations.map((item) => item.id),
    ...model.dsa.algorithmicPatterns.map((item) => item.id),
  ]);
}

function validateLearningSteps(
  steps: LearningStep[],
  known: Set<string>,
  collector: Collector,
): void {
  checkUniqueIds(steps, "learning step", collector, "learningSteps");
  steps.forEach((step, index) => {
    step.elementRefs.forEach((ref, refIndex) => {
      if (!known.has(ref)) {
        collector.error(
          "unknown_learning_ref",
          `Learning step reference "${ref}" does not exist.`,
          `learningSteps[${index}].elementRefs[${refIndex}]`,
        );
      }
    });
  });
}

function semanticChecks(
  model: ArchitectureModel,
  spec: RequirementsSpec,
  collector: Collector,
): void {
  const referenced = new Set<string>();
  for (const item of model.lld.classes) {
    item.requirementRefs.forEach((ref) => referenced.add(ref));
  }
  for (const item of model.lld.patterns) {
    item.requirementRefs.forEach((ref) => referenced.add(ref));
  }
  for (const item of model.hld.components) {
    item.requirementRefs.forEach((ref) => referenced.add(ref));
  }
  for (const item of model.hld.flows) {
    item.requirementRefs.forEach((ref) => referenced.add(ref));
  }
  for (const item of model.dsa.recommendations) {
    item.requirementRefs.forEach((ref) => referenced.add(ref));
  }

  for (const requirement of spec.functional) {
    if (requirement.priority === "must" && !referenced.has(requirement.id)) {
      collector.warn(
        "unreferenced_must_requirement",
        `Must-have requirement "${requirement.text}" is not referenced by any element.`,
        `requirements.functional(${requirement.id})`,
      );
    }
  }

  for (const requirement of spec.nonFunctional) {
    const measurable =
      /\d/.test(requirement.target) || /\d/.test(requirement.text);
    if (!measurable) {
      collector.warn(
        "nfr_without_measurable_target",
        `Non-functional requirement "${requirement.text}" has no measurable target.`,
        `requirements.nonFunctional(${requirement.id})`,
      );
    }
  }

  if (model.lld.classes.length < 1) {
    collector.warn("minimal_model", "The architecture has no classes.");
  }
  if (model.hld.components.length < 1) {
    collector.warn("minimal_model", "The architecture has no components.");
  }
  if (model.hld.connections.length < 1) {
    collector.warn("minimal_model", "The architecture has no connections.");
  }
}

export function validateArchitectureModel(
  model: ArchitectureModel,
): ValidationResult {
  const collector = new Collector();
  validateLld(model.lld, model.requirements.spec, collector);
  validateHld(model.hld, model.requirements.spec, collector);
  validateDsa(model.dsa, model.requirements.spec, collector);
  validateLearningSteps(model.learningSteps, collectElementIds(model), collector);
  semanticChecks(model, model.requirements.spec, collector);
  return collector.result();
}

export function validateHldSection(
  hld: HldModel,
  requirements: ConfirmedRequirements,
): ValidationResult {
  const collector = new Collector();
  validateHld(hld, requirements.spec, collector);
  return collector.result();
}

export function validateLldDsaSection(
  section: {
    lld: LldModel;
    dsa: DsaModel;
    learningSteps: LearningStep[];
  },
  hld: HldModel,
  requirements: ConfirmedRequirements,
): ValidationResult {
  const collector = new Collector();
  validateLld(section.lld, requirements.spec, collector);
  validateDsa(section.dsa, requirements.spec, collector);
  const known = new Set([
    ...section.lld.classes.map((item) => item.id),
    ...section.lld.relationships.map((item) => item.id),
    ...section.lld.patterns.map((item) => item.id),
    ...hld.components.map((item) => item.id),
    ...hld.connections.map((item) => item.id),
    ...hld.flows.map((item) => item.id),
    ...section.dsa.recommendations.map((item) => item.id),
    ...section.dsa.algorithmicPatterns.map((item) => item.id),
  ]);
  validateLearningSteps(section.learningSteps, known, collector);
  return collector.result();
}

/** Drops learning refs to elements a scoped regeneration removed. */
export function pruneLearningSteps(
  steps: LearningStep[],
  known: Set<string>,
): { steps: LearningStep[]; removedRefs: string[] } {
  const removedRefs: string[] = [];
  const kept: LearningStep[] = [];
  for (const step of steps) {
    const refs = step.elementRefs.filter((ref) => {
      const exists = known.has(ref);
      if (!exists) {
        removedRefs.push(ref);
      }
      return exists;
    });
    if (refs.length > 0) {
      kept.push({ ...step, elementRefs: refs });
    }
  }
  return { steps: kept, removedRefs };
}
