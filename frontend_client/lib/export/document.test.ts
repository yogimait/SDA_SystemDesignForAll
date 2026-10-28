import { describe, expect, it } from "vitest";
import type {
  ArchitectureModel,
  ArchitectureVersion,
  Project,
  RequirementsSpec,
} from "@sda/contracts";
import {
  buildCover,
  clarificationRows,
  documentDate,
  functionalRows,
  learningStepRows,
  nonFunctionalRows,
  warningRows,
} from "./document";

const spec: RequirementsSpec = {
  functional: [
    { id: "fr_1", kind: "functional", text: "Users can submit ideas", priority: "must" },
  ],
  nonFunctional: [
    {
      id: "nfr_1",
      kind: "nonfunctional",
      text: "Respond under 200ms",
      priority: "should",
      category: "performance",
      target: "p95 < 200ms",
    },
    {
      id: "nfr_2",
      kind: "nonfunctional",
      text: "Stay maintainable",
      priority: "could",
      category: "maintainability",
      target: "",
    },
  ],
  assumptions: [{ id: "asm_1", text: "Single region deployment" }],
  clarifications: [{ id: "q_1", question: "Which cloud?", answer: "AWS" }],
};

const model: ArchitectureModel = {
  meta: { title: "Rate limiter", summary: "Sliding-window limiter." },
  requirements: { confirmedAt: "2026-01-05T00:00:00.000Z", spec },
  lld: {
    classes: [
      {
        id: "cls_1",
        name: "Limiter",
        kind: "class",
        responsibility: "Tracks windows",
        rationale: "Simplest fit",
        requirementRefs: ["fr_1"],
        alternatives: [],
        invariants: [],
        attributes: [],
        methods: [],
      },
    ],
    relationships: [],
    patterns: [],
  },
  hld: {
    components: [
      {
        id: "cmp_1",
        name: "API",
        type: "gateway",
        responsibility: "Accepts calls",
        technology: "",
        requirementRefs: [],
        scalingNotes: "",
      },
    ],
    connections: [
      {
        id: "conn_1",
        fromComponentId: "cmp_1",
        toComponentId: "cmp_1",
        kind: "sync",
        label: "check",
        protocol: "",
        rationale: "local",
      },
    ],
    flows: [
      {
        id: "flow_1",
        name: "Check limit",
        description: "Client hits gateway",
        steps: [{ order: 1, description: "gateway checks", elementRefs: ["cmp_1"] }],
        requirementRefs: [],
      },
    ],
    technologyDecisions: [],
    scalabilityNotes: [],
    failureScenarios: [],
  },
  dsa: {
    recommendations: [
      {
        id: "dsa_1",
        operation: "check rate",
        layer: "lld",
        dataStructure: "ring buffer",
        algorithm: "sliding window",
        complexity: { average: "O(1)", worst: "O(1)", notes: "" },
        rationale: "Fixed memory",
        requirementRefs: [],
        assumptions: [],
        alternatives: [],
        limitations: [],
      },
    ],
    algorithmicPatterns: [],
  },
  learningSteps: [
    {
      id: "step_1",
      title: "Window math",
      explanation: "Buckets roll every N seconds.",
      elementRefs: ["cls_1", "cmp_1"],
    },
  ],
};

const version: ArchitectureVersion = {
  id: "ver_1",
  projectId: "proj_1",
  version: 3,
  createdAt: "2026-02-01T10:00:00.000Z",
  model,
  validation: {
    valid: true,
    errors: [],
    warnings: [
      { rule: "unreferenced_must_requirement", severity: "warning", message: "FR not referenced", path: "fr_9" },
    ],
    validatedAt: "2026-02-01T10:00:01.000Z",
  },
};

const project: Project = {
  id: "proj_1",
  idea: "Design a rate limiter",
  ownerId: "usr_1",
  status: "architecture_ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  currentArchitectureVersion: 3,
};

describe("export document composition", () => {
  it("builds the cover from contract fields only", () => {
    const cover = buildCover(project, version);
    expect(cover).toMatchObject({
      title: "Rate limiter",
      summary: "Sliding-window limiter.",
      idea: "Design a rate limiter",
      version: 3,
      confirmedAt: "2026-01-05T00:00:00.000Z",
      valid: true,
      warningCount: 1,
      errorCount: 0,
    });
  });

  it("maps requirement rows with priorities and NFR targets", () => {
    expect(functionalRows(spec)).toEqual([
      { id: "fr_1", text: "Users can submit ideas", priority: "must", meta: "functional" },
    ]);
    expect(nonFunctionalRows(spec)).toEqual([
      { id: "nfr_1", text: "Respond under 200ms", priority: "should", meta: "performance · p95 < 200ms" },
      { id: "nfr_2", text: "Stay maintainable", priority: "could", meta: "maintainability" },
    ]);
    expect(clarificationRows(spec)).toEqual([
      { id: "q_1", question: "Which cloud?", answer: "AWS" },
    ]);
  });

  it("joins learning-step element refs and lists warnings from both severities", () => {
    expect(learningStepRows(model)[0]?.refs).toBe("cls_1, cmp_1");

    const withErrors: typeof version = {
      ...version,
      validation: {
        valid: false,
        errors: [{ rule: "orphan_class", severity: "error", message: "No relationships" }],
        warnings: version.validation.warnings,
        validatedAt: "t",
      },
    };
    const rows = warningRows(withErrors);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ severity: "error", path: "" });
    expect(rows[1]?.path).toBe("fr_9");
  });

  it("formats the cover date and survives malformed input", () => {
    expect(documentDate("2026-02-01T10:00:00.000Z")).toContain("February");
    expect(documentDate("not-a-date")).toBe("not-a-date");
  });
});
