/**
 * Guided-mode mapping tests (F5 LLD, extended in F6 across scopes): steps
 * resolve to per-scope scene ids (cls_/rel_, cmp_/conn_, dsa_*), scope
 * filtering keeps only highlightable steps, DSA walkthrough derives per-
 * recommendation steps from contract fields, and grounding has no dangling
 * references on two different fixture models.
 */
import { describe, expect, it } from "vitest";
import type { DsaModel, LldModel, LearningStep } from "@sda/contracts";
import {
  dsaGuidedSteps,
  guidedSequence,
  guidedStepFocus,
  guidedStepsInScope,
  sequenceIsGrounded,
  stepInScope,
} from "./guided";

const step = (id: string, refs: string[]): LearningStep => ({
  id,
  title: `Step ${id}`,
  explanation: "why this element now",
  elementRefs: refs,
});

// A second, differently-shaped LLD fixture (per the planner's two-fixture rule).
const lldFixture2: LldModel = {
  classes: [
    {
      id: "cls_a",
      name: "A",
      kind: "class",
      responsibility: "r",
      requirementRefs: [],
      rationale: "r",
      alternatives: [],
      invariants: [],
      attributes: [],
      methods: [],
    },
    {
      id: "cls_b",
      name: "B",
      kind: "interface",
      responsibility: "r",
      requirementRefs: [],
      rationale: "r",
      alternatives: [],
      invariants: [],
      attributes: [],
      methods: [],
    },
  ],
  relationships: [
    {
      id: "rel_b",
      kind: "realization",
      sourceId: "cls_a",
      targetId: "cls_b",
      sourceMultiplicity: "1",
      targetMultiplicity: "1",
      label: "",
      rationale: "r",
    },
  ],
  patterns: [],
};

const lldCandidateIds = (fixture: LldModel) => ({
  classIds: fixture.classes.map((c) => c.id),
  relationshipIds: fixture.relationships.map((r) => r.id),
  componentIds: [],
  connectionIds: [],
  recommendationIds: [],
});

describe("guidedStepFocus", () => {
  it("classifies refs across scopes and deduplicates, reporting the rest", () => {
    const focus = guidedStepFocus(
      step("step_1", ["cls_a", "rel_b", "cmp_api", "conn_sql", "dsa_lookup", "cls_a", "pat_repo", "nfr_x"]),
    );
    expect(focus.classIds).toEqual(["cls_a"]);
    expect(focus.relationshipIds).toEqual(["rel_b"]);
    expect(focus.componentIds).toEqual(["cmp_api"]);
    expect(focus.connectionIds).toEqual(["conn_sql"]);
    expect(focus.recommendationIds).toEqual(["dsa_lookup"]);
    expect(focus.unknownIds).toEqual(["pat_repo", "nfr_x"]);
  });
});

describe("stepInScope + guidedStepsInScope", () => {
  const steps = [
    step("step_lld", ["cls_a", "rel_b"]),
    step("step_hld", ["cmp_api", "conn_sql"]),
    step("step_dsa", ["dsa_lookup"]),
  ];

  it("filters steps to the refs each scope can highlight", () => {
    expect(stepInScope(steps[0], "lld")).toBe(true);
    expect(stepInScope(steps[0], "hld")).toBe(false);
    expect(stepInScope(steps[2], "dsa")).toBe(true);
    expect(stepInScope(steps[2], "lld")).toBe(false);
  });

  it("keeps model order and only steps with scope refs", () => {
    const lld = guidedStepsInScope(steps, "lld");
    expect(lld.map((s) => s.id)).toEqual(["step_lld"]);
    expect(lld[0]).toMatchObject({ scope: "lld", classIds: ["cls_a"], relationshipIds: ["rel_b"] });

    const hld = guidedStepsInScope(steps, "hld");
    expect(hld.map((s) => s.id)).toEqual(["step_hld"]);
    expect(hld[0]).toMatchObject({ scope: "hld", componentIds: ["cmp_api"], connectionIds: ["conn_sql"] });
  });
});

describe("dsaGuidedSteps", () => {
  const rec = (id: string, operation: string, rationale: string) => ({
    id,
    operation,
    layer: "hld" as const,
    dataStructure: "B-tree index",
    algorithm: "Index range scan ordered by workspace id.",
    complexity: { average: "O(log n)", worst: "O(log n)", notes: "" },
    rationale,
    requirementRefs: [],
    assumptions: [],
    alternatives: [],
    limitations: [],
  });
  const dsa: DsaModel = {
    recommendations: [
      rec("dsa_lookup", "Fetch items for one workspace.", "Index range scan beats full scans."),
      rec("dsa_lock", "Acquire an edit lock.", "Mutex rows avoid hot in-memory contention."),
    ],
    algorithmicPatterns: [],
  };

  it("uses the model's dsa_-scoped learning steps when they exist", () => {
    const result = dsaGuidedSteps(
      [step("step_dsa1", ["dsa_lookup", "dsa_lock"])],
      dsa,
    );
    expect(result.map((s) => s.id)).toEqual(["step_dsa1"]);
    expect(result[0].recommendationIds).toEqual(["dsa_lookup", "dsa_lock"]);
  });

  it("derives one step per recommendation otherwise, from contract fields only", () => {
    const result = dsaGuidedSteps([step("step_lld", ["cls_a"])], dsa);
    expect(result.map((s) => s.id)).toEqual(["derived_dsa_lookup", "derived_dsa_lock"]);
    expect(result[0].title).toBe("Fetch items for one workspace.");
    expect(result[0].explanation).toBe("Index range scan beats full scans.");
    expect(result[1].recommendationIds).toEqual(["dsa_lock"]);
  });

  it("yields nothing when the model has no recommendations", () => {
    expect(dsaGuidedSteps([step("step_dsa", ["dsa_x"])], { recommendations: [], algorithmicPatterns: [] })).toEqual(
      [],
    );
  });
});

describe("guidedSequence", () => {
  it("resolves the full sequence in order across scopes", () => {
    const sequence = guidedSequence([
      step("step_1", ["cls_impl", "cls_base"]),
      step("step_2", ["rel_inheritance"]),
      step("step_3", ["cmp_api", "dsa_lookup"]),
    ]);
    expect(sequence.map((s) => s.id)).toEqual(["step_1", "step_2", "step_3"]);
    expect(sequence[0].classIds).toEqual(["cls_impl", "cls_base"]);
    expect(sequence[1].relationshipIds).toEqual(["rel_inheritance"]);
    expect(sequence[2].unknownIds).toEqual([]);
  });
});

describe("sequenceIsGrounded", () => {
  it("is grounded (no dangling references) across mixed scopes", () => {
    const sequence = guidedSequence([
      step("step_1", ["cls_a", "rel_b"]),
      step("step_2", ["cmp_api", "conn_sql", "dsa_lookup"]),
    ]);
    expect(
      sequenceIsGrounded(sequence, {
        classIds: ["cls_a", "cls_b"],
        relationshipIds: ["rel_b"],
        componentIds: ["cmp_api"],
        connectionIds: ["conn_sql"],
        recommendationIds: ["dsa_lookup"],
      }),
    ).toBe(true);
  });

  it("flags dangling references instead of silently dropping them", () => {
    const sequence = guidedSequence([step("step_1", ["cls_absent"])]);
    expect(sequenceIsGrounded(sequence, lldCandidateIds(lldFixture2))).toBe(false);
    // cls_absent carries the cls_ prefix, so it is classified as a class id
    // and caught by grounding, not hidden as "unknown context".
    expect(sequence[0].classIds).toEqual(["cls_absent"]);
  });

  it("is grounded on fixture two", () => {
    const sequence = guidedSequence([step("step_1", ["cls_b"]), step("step_2", ["cls_a", "rel_b"])]);
    expect(sequenceIsGrounded(sequence, lldCandidateIds(lldFixture2))).toBe(true);
  });
});
