import type {
  DsaModel,
  FunctionalRequirement,
  HldModel,
  LldModel,
  RequirementsSpec,
  ValidationIssue,
} from "@sda/contracts";

interface RefHolding {
  requirementRefs: string[];
}

/**
 * Must-have functional requirements that no element claims. The validator warns
 * about this; generation treats it as a repairable error so a must-have is never
 * silently ignored.
 */
export function missingMustHaveRequirements(
  groups: ReadonlyArray<readonly RefHolding[]>,
  spec: RequirementsSpec,
): FunctionalRequirement[] {
  const referenced = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      for (const ref of item.requirementRefs) referenced.add(ref);
    }
  }
  return spec.functional.filter(
    (requirement) =>
      requirement.priority === "must" && !referenced.has(requirement.id),
  );
}

export function mustHaveCoverageIssues(
  missing: readonly FunctionalRequirement[],
): ValidationIssue[] {
  return missing.map((requirement) => ({
    rule: "unreferenced_must_requirement",
    severity: "error",
    path: `requirements.functional(${requirement.id})`,
    message: `Must-have requirement ${requirement.id} "${requirement.text}" is not referenced by any element. Add ${requirement.id} to the requirementRefs of the element that genuinely implements it; do not invent refs.`,
  }));
}

export function hldMustHaveIssues(
  hld: HldModel,
  spec: RequirementsSpec,
): ValidationIssue[] {
  return mustHaveCoverageIssues(
    missingMustHaveRequirements([hld.components, hld.flows], spec),
  );
}

export function mergedMustHaveIssues(
  hld: HldModel,
  section: { lld: LldModel; dsa: DsaModel },
  spec: RequirementsSpec,
): ValidationIssue[] {
  return mustHaveCoverageIssues(
    missingMustHaveRequirements(
      [
        hld.components,
        hld.flows,
        section.lld.classes,
        section.lld.patterns,
        section.dsa.recommendations,
      ],
      spec,
    ),
  );
}
