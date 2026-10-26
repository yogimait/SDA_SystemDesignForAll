/**
 * Guided learning mode (F5, extended in F6 across tabs): resolve a
 * LearningStep's elementRefs to scene ids per view scope. Pure mapping only —
 * refs are prefix-classified (cls_/rel_, cmp_/conn_, dsa_*); anything
 * unclassifiable lands in unknownIds so dangling references are visible in
 * tests instead of silently dropping highlights.
 */
import type { DsaModel, LearningStep } from "@sda/contracts";

export type GuidedScope = "lld" | "hld" | "dsa";

/** Classification per ref prefix (LLD classes/relationships). */
export type LldStepFocus = {
  id: string;
  title: string;
  explanation: string;
  scope: "lld";
  classIds: string[];
  relationshipIds: string[];
  /** refs that are neither class nor relationship ids (patterns etc.) */
  unknownIds: string[];
};

export type HldStepFocus = {
  id: string;
  title: string;
  explanation: string;
  scope: "hld";
  componentIds: string[];
  connectionIds: string[];
  unknownIds: string[];
};

export type DsaStepFocus = {
  id: string;
  title: string;
  explanation: string;
  scope: "dsa";
  recommendationIds: string[];
  unknownIds: string[];
};

export type GuidedStep = LldStepFocus | HldStepFocus | DsaStepFocus;

/** Refs the scope can highlight; every other ref is unknown for that scope. */
const SCOPE_PREFIXES: Record<GuidedScope, string[]> = {
  lld: ["cls_", "rel_"],
  hld: ["cmp_", "conn_"],
  dsa: ["dsa_"],
};

/** true when the step has at least one reference the scope can highlight. */
export function stepInScope(step: LearningStep, scope: GuidedScope): boolean {
  return step.elementRefs.some((ref) => SCOPE_PREFIXES[scope].some((p) => ref.startsWith(p)));
}

export type StepFocus = {
  classIds: string[];
  relationshipIds: string[];
  componentIds: string[];
  connectionIds: string[];
  recommendationIds: string[];
  unknownIds: string[];
};

/** Full-ref classification across scopes (test-level view of one step). */
export function guidedStepFocus(step: LearningStep): StepFocus {
  const focus: StepFocus = {
    classIds: [],
    relationshipIds: [],
    componentIds: [],
    connectionIds: [],
    recommendationIds: [],
    unknownIds: [],
  };
  for (const ref of step.elementRefs) {
    let known = false;
    for (const scope of ["lld", "hld", "dsa"] as const) {
      for (const prefix of SCOPE_PREFIXES[scope]) {
        if (!ref.startsWith(prefix)) continue;
        known = true;
        if (prefix === "cls_") pushUnique(focus.classIds, ref);
        else if (prefix === "rel_") pushUnique(focus.relationshipIds, ref);
        else if (prefix === "cmp_") pushUnique(focus.componentIds, ref);
        else if (prefix === "conn_") pushUnique(focus.connectionIds, ref);
        else pushUnique(focus.recommendationIds, ref);
      }
    }
    if (!known) focus.unknownIds.push(ref);
  }
  return focus;
}

function pushUnique(list: string[], ref: string): void {
  if (!list.includes(ref)) list.push(ref);
}

/** The exact focus-step type a scope's sequence contains. */
export type GuidedStepsFor<S extends GuidedScope> =
  S extends "lld" ? LldStepFocus[] : S extends "hld" ? HldStepFocus[] : DsaStepFocus[];

/**
 * The guided sequence for one view scope: learningSteps in model order,
 * filtered to steps the scope can highlight, classified into usable ids.
 */
export function guidedStepsInScope<S extends GuidedScope>(
  learningSteps: LearningStep[],
  scope: S,
): GuidedStepsFor<S> {
  const mapped = learningSteps
    .filter((step) => stepInScope(step, scope))
    .map((step) => {
      const focus = guidedStepFocus(step);
      const base = { id: step.id, title: step.title, explanation: step.explanation };
      if (scope === "lld") {
        return {
          ...base,
          scope,
          classIds: focus.classIds,
          relationshipIds: focus.relationshipIds,
          unknownIds: focus.unknownIds,
        } as LldStepFocus;
      }
      if (scope === "hld") {
        return {
          ...base,
          scope,
          componentIds: focus.componentIds,
          connectionIds: focus.connectionIds,
          unknownIds: focus.unknownIds,
        } as HldStepFocus;
      }
      return {
        ...base,
        scope,
        recommendationIds: focus.recommendationIds,
        unknownIds: focus.unknownIds,
      } as DsaStepFocus;
    });
  // The runtime shapes match the scope-one-to-one; the cast keeps it typed.
  return mapped as GuidedStepsFor<S>;
}

/**
 * DSA walkthrough (F6): normally the model's own dsa_-scoped learning steps.
 * When a model has none, derive one step per recommendation from its own
 * contract fields (operation title, rationale) — presentation-layer text
 * like lib/dsa/format.ts, no invented content.
 * @returns steps for the DSA tab's GuidedBar.
 */
export function dsaGuidedSteps(
  learningSteps: LearningStep[],
  dsa: DsaModel,
): DsaStepFocus[] {
  if (dsa.recommendations.length === 0) return [];
  const scoped = guidedStepsInScope(learningSteps, "dsa") as DsaStepFocus[];
  if (scoped.length > 0) return scoped;
  return dsa.recommendations.map((rec) => ({
    id: `derived_${rec.id}`,
    title: rec.operation,
    explanation: rec.rationale,
    scope: "dsa",
    recommendationIds: [rec.id],
    unknownIds: [],
  }));
}

/**
 * The LLD guided sequence (F5 API kept): all learning steps resolved to
 * class/relationship scene ids.
 */
export function guidedSequence(
  learningSteps: LearningStep[],
): Array<{ id: string; classIds: string[]; relationshipIds: string[]; unknownIds: string[] }> {
  return learningSteps.map((step) => {
    const focus = guidedStepFocus(step);
    return {
      id: step.id,
      classIds: focus.classIds,
      relationshipIds: focus.relationshipIds,
      unknownIds: focus.unknownIds,
    };
  });
}

function groundedIds(
  ids: string[],
  known: Set<string>,
): boolean {
  return ids.every((id) => known.has(id));
}

/** True when every focus step references only ids present in the model. */
export function sequenceIsGrounded(
  sequence: Array<{
    classIds?: string[];
    relationshipIds?: string[];
    componentIds?: string[];
    connectionIds?: string[];
    recommendationIds?: string[];
  }>,
  candidates: {
    classIds: string[];
    relationshipIds: string[];
    componentIds: string[];
    connectionIds: string[];
    recommendationIds: string[];
  },
): boolean {
  const known = {
    classIds: new Set(candidates.classIds),
    relationshipIds: new Set(candidates.relationshipIds),
    componentIds: new Set(candidates.componentIds),
    connectionIds: new Set(candidates.connectionIds),
    recommendationIds: new Set(candidates.recommendationIds),
  };
  for (const step of sequence) {
    if (
      !groundedIds(step.classIds ?? [], known.classIds) ||
      !groundedIds(step.relationshipIds ?? [], known.relationshipIds) ||
      !groundedIds(step.componentIds ?? [], known.componentIds) ||
      !groundedIds(step.connectionIds ?? [], known.connectionIds) ||
      !groundedIds(step.recommendationIds ?? [], known.recommendationIds)
    ) {
      return false;
    }
  }
  return true;
}
