import type {
  ArchitectureModel,
  ConfirmedRequirements,
  HldModel,
  LldDsaOutput,
} from "@sda/contracts";
import { describe, expect, it } from "vitest";
import {
  pruneLearningSteps,
  validateArchitectureModel,
  validateHldSection,
  validateLldDsaSection,
} from "../../src/architecture/validator.js";
import type { GenerateStructuredInput } from "../../src/providers/model-provider.js";
import { MockProvider } from "../../src/providers/mock/mock.provider.js";

const requirements: ConfirmedRequirements = {
  confirmedAt: "2026-01-01T00:00:00.000Z",
  spec: {
    functional: [
      {
        id: "fr_workspace",
        kind: "functional",
        text: "Users can organize items in a workspace.",
        priority: "must",
      },
    ],
    nonFunctional: [
      {
        id: "nfr_latency",
        kind: "nonfunctional",
        text: "Workspace reads stay fast.",
        priority: "must",
        category: "performance",
        target: "p95 under 200 ms",
      },
    ],
    assumptions: [],
    clarifications: [],
  },
};

function request(schemaName: string): GenerateStructuredInput {
  return {
    model: "test/model",
    system: "",
    messages: [],
    schemaName,
    jsonSchema: {},
    maxOutputTokens: 100,
    timeoutMs: 1000,
  };
}

async function fixture(): Promise<{
  model: ArchitectureModel;
  hld: HldModel;
  section: LldDsaOutput;
}> {
  const mock = new MockProvider();
  const hld = structuredClone(
    (await mock.generateStructured(request("hld_model"))).data,
  ) as HldModel;
  const section = structuredClone(
    (await mock.generateStructured(request("lld_dsa_model"))).data,
  ) as LldDsaOutput;
  return {
    hld,
    section,
    model: {
      meta: section.meta,
      requirements,
      hld,
      lld: section.lld,
      dsa: section.dsa,
      learningSteps: section.learningSteps,
    },
  };
}

describe("validateArchitectureModel", () => {
  it("accepts the mock model and reports semantic warnings", async () => {
    const { model } = await fixture();
    const result = validateArchitectureModel(model);

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.rule)).toContain(
      "unreferenced_must_requirement",
    );
  });

  it("rejects unknown connection endpoints and self connections", async () => {
    const { model } = await fixture();
    const unknown = structuredClone(model);
    unknown.hld.connections[0].fromComponentId = "cmp_missing";
    expect(validateArchitectureModel(unknown).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "unknown_connection_endpoint" }),
      ]),
    );

    const self = structuredClone(model);
    self.hld.connections[0].toComponentId =
      self.hld.connections[0].fromComponentId;
    expect(validateArchitectureModel(self).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "self_connection" }),
      ]),
    );
  });

  it("warns on an orphan HLD component", async () => {
    const { model } = await fixture();
    const orphan = structuredClone(model.hld.components[0]);
    orphan.id = "cmp_orphan";
    orphan.name = "Orphan component";
    model.hld.components.push(orphan);

    expect(validateArchitectureModel(model).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "orphan_component",
          path: "hld.components(cmp_orphan)",
        }),
      ]),
    );
  });

  it("rejects unknown requirement and flow references", async () => {
    const { model } = await fixture();
    model.hld.components[0].requirementRefs = ["fr_missing"];
    model.hld.flows[0].steps[0].elementRefs = ["cmp_missing"];

    const rules = validateArchitectureModel(model).errors.map(
      (error) => error.rule,
    );
    expect(rules).toContain("unknown_requirement_ref");
    expect(rules).toContain("unknown_flow_ref");
  });

  it("rejects duplicate ids and mismatched relationship kinds", async () => {
    const { model } = await fixture();
    model.hld.components.push({ ...model.hld.components[0] });
    model.lld.relationships[0].kind = "inheritance";

    const rules = validateArchitectureModel(model).errors.map(
      (error) => error.rule,
    );
    expect(rules).toContain("duplicate_id");
    expect(rules).toContain("relationship_kind_mismatch");
    expect(rules).toContain("relationship_multiplicity_mismatch");
  });

  it("enforces the multiplicity matrix for inheritance and aggregation", async () => {
    const { model } = await fixture();
    model.lld.relationships[0] = {
      ...model.lld.relationships[0],
      kind: "inheritance",
      sourceId: "cls_workspace",
      targetId: "cls_item",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
    };
    expect(
      validateArchitectureModel(model).errors.map((error) => error.rule),
    ).toContain("relationship_multiplicity_mismatch");

    const aggregation = await fixture();
    aggregation.model.lld.relationships[0] = {
      ...aggregation.model.lld.relationships[0],
      kind: "aggregation",
      sourceMultiplicity: "1..*",
    };
    expect(
      validateArchitectureModel(aggregation.model).errors.map(
        (error) => error.rule,
      ),
    ).toContain("relationship_multiplicity_mismatch");
  });

  it("allows an association to target an interface", async () => {
    const { model } = await fixture();
    model.lld.classes[1].kind = "interface";
    model.lld.relationships[0] = {
      ...model.lld.relationships[0],
      kind: "association",
      sourceId: "cls_workspace",
      targetId: "cls_item",
    };

    expect(
      validateArchitectureModel(model).errors.map((error) => error.rule),
    ).not.toContain("relationship_kind_mismatch");
  });

  it("warns on an orphan class but allows a standalone enum", async () => {
    const { model } = await fixture();
    const orphan = structuredClone(model.lld.classes[0]);
    orphan.id = "cls_orphan";
    orphan.name = "Orphan";
    orphan.kind = "class";
    orphan.attributes = [];
    orphan.methods = [];
    model.lld.classes.push(orphan);

    const enumOrphan = {
      ...structuredClone(orphan),
      id: "cls_orphan_enum",
      name: "OrphanEnum",
      kind: "enum" as const,
    };
    model.lld.classes.push(enumOrphan);

    const warnings = validateArchitectureModel(model).warnings;
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "orphan_class",
          path: "lld.classes(cls_orphan)",
        }),
      ]),
    );
    expect(
      warnings.some(
        (warning) => warning.path === "lld.classes(cls_orphan_enum)",
      ),
    ).toBe(false);
  });

  it("accepts learning-step references to HLD technology decisions", async () => {
    const { section, hld } = await fixture();
    const techId = hld.technologyDecisions[0]?.id;
    expect(techId).toBeTruthy();
    section.learningSteps[0].elementRefs = [techId as string];

    const result = validateLldDsaSection(section, hld, requirements);
    expect(
      result.errors.some((error) => error.rule === "unknown_learning_ref"),
    ).toBe(false);
  });

  it("warns on duplicate names and missing DSA complexity", async () => {
    const { model } = await fixture();
    model.hld.components[1].name = model.hld.components[0].name;
    model.dsa.recommendations[0].complexity.worst = " ";

    const result = validateArchitectureModel(model);
    expect(result.errors.map((error) => error.rule)).toContain(
      "missing_complexity",
    );
    expect(result.warnings.map((warning) => warning.rule)).toContain(
      "duplicate_component_name",
    );
  });

  it("rejects learning steps that point at removed elements", async () => {
    const { model } = await fixture();
    model.learningSteps[0].elementRefs = ["cmp_missing"];

    const result = validateArchitectureModel(model);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "unknown_learning_ref" }),
      ]),
    );
  });
});

describe("section validators", () => {
  it("validates the HLD independently", async () => {
    const { hld } = await fixture();
    expect(validateHldSection(hld, requirements).errors).toEqual([]);
  });

  it("validates LLD/DSA with the supplied HLD and flags learning refs", async () => {
    const { hld, section } = await fixture();
    const valid = validateLldDsaSection(section, hld, requirements);
    expect(valid.errors).toEqual([]);

    const broken: LldDsaOutput = {
      ...section,
      learningSteps: [
        {
          ...section.learningSteps[0],
          elementRefs: ["cmp_missing"],
        },
      ],
    };
    expect(
      validateLldDsaSection(broken, hld, requirements).errors.map(
        (error) => error.rule,
      ),
    ).toContain("unknown_learning_ref");
  });
});

describe("pruneLearningSteps", () => {
  it("drops stale references and reports them", () => {
    const { steps, removedRefs } = pruneLearningSteps(
      [
        {
          id: "step_one",
          title: "One",
          explanation: "First step.",
          elementRefs: ["cmp_client", "cmp_missing"],
        },
        {
          id: "step_two",
          title: "Two",
          explanation: "Second step.",
          elementRefs: ["cmp_gone"],
        },
      ],
      new Set(["cmp_client"]),
    );

    expect(steps).toEqual([
      expect.objectContaining({
        id: "step_one",
        elementRefs: ["cmp_client"],
      }),
    ]);
    expect(removedRefs).toEqual(["cmp_missing", "cmp_gone"]);
  });
});