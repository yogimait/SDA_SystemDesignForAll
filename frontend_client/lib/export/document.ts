import type {
  ArchitectureModel,
  ArchitectureVersion,
  Project,
  RequirementsSpec,
} from "@sda/contracts";

/**
 * Pure document composition for the export route: every rendered string is
 * derived from contract fields (no invented content), so these helpers are
 * unit-testable without a DOM.
 */

export interface CoverInfo {
  title: string;
  summary: string;
  idea: string;
  version: number;
  createdAt: string;
  confirmedAt: string;
  validatedAt: string;
  valid: boolean;
  warningCount: number;
  errorCount: number;
}

export function buildCover(
  project: Project,
  version: ArchitectureVersion,
): CoverInfo {
  return {
    title: version.model.meta.title,
    summary: version.model.meta.summary,
    idea: project.idea,
    version: version.version,
    createdAt: version.createdAt,
    confirmedAt: version.model.requirements.confirmedAt,
    validatedAt: version.validation.validatedAt,
    valid: version.validation.valid,
    warningCount: version.validation.warnings.length,
    errorCount: version.validation.errors.length,
  };
}

export interface RequirementRow {
  id: string;
  text: string;
  priority: string;
  meta: string;
}

export function functionalRows(spec: RequirementsSpec): RequirementRow[] {
  return spec.functional.map((item) => ({
    id: item.id,
    text: item.text,
    priority: item.priority,
    meta: "functional",
  }));
}

export function nonFunctionalRows(spec: RequirementsSpec): RequirementRow[] {
  return spec.nonFunctional.map((item) => ({
    id: item.id,
    text: item.text,
    priority: item.priority,
    meta: item.target === "" ? item.category : `${item.category} · ${item.target}`,
  }));
}

export function clarificationRows(spec: RequirementsSpec): Array<{
  id: string;
  question: string;
  answer: string;
}> {
  return spec.clarifications.map((item) => ({
    id: item.id,
    question: item.question,
    answer: item.answer?.trim() ?? "",
  }));
}

export function learningStepRows(model: ArchitectureModel): Array<{
  id: string;
  title: string;
  explanation: string;
  refs: string;
}> {
  return model.learningSteps.map((step) => ({
    id: step.id,
    title: step.title,
    explanation: step.explanation,
    refs: step.elementRefs.join(", "),
  }));
}

export function warningRows(version: ArchitectureVersion): Array<{
  rule: string;
  severity: string;
  message: string;
  path: string;
}> {
  return [...version.validation.errors, ...version.validation.warnings].map(
    (issue) => ({
      rule: issue.rule,
      severity: issue.severity,
      message: issue.message,
      path: issue.path ?? "",
    }),
  );
}

/** Date stamp for the cover: locale-resolved, stable for tests with a fixed input. */
export function documentDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}
