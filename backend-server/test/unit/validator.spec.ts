import type {
  ArchitectureModel,
  ConfirmedRequirements,
  HldModel,
  LldDsaOutput,
  RequirementsSpec,
} from "@sda/contracts";
import { describe, expect, it } from "vitest";
import {
  pruneLearningSteps,
  toValidationReport,
  validateArchitectureModel,
  validateHldSection,
  validateLldDsaSection,
  validateLldSection,
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

describe("consistency warnings", () => {
  const securityNfr = {
    id: "nfr_security",
    kind: "nonfunctional" as const,
    text: "Task data must be protected from unauthorized access.",
    priority: "must" as const,
    category: "security" as const,
    target: "",
  };
  const localOnlyNfr = {
    id: "nfr_local",
    kind: "nonfunctional" as const,
    text: "The system runs fully locally; no task data leaves the machine.",
    priority: "must" as const,
    category: "security" as const,
    target: "",
  };
  const executionFr = {
    id: "fr_execute",
    kind: "functional" as const,
    text: "Agents execute tools and run shell commands on the user machine.",
    priority: "must" as const,
  };
  const outOfScopeAssumption = {
    id: "asm_scope",
    text: "Actual execution of generated code is out of scope.",
  };

  function withSpec(
    spec: Partial<RequirementsSpec>,
  ): ConfirmedRequirements {
    return {
      confirmedAt: requirements.confirmedAt,
      spec: { ...structuredClone(requirements.spec), ...spec },
    };
  }

  function rules(model: ArchitectureModel): string[] {
    return validateArchitectureModel(model).warnings.map(
      (warning) => warning.rule,
    );
  }

  function addCloudComponent(model: ArchitectureModel): void {
    model.hld.components.push({
      id: "cmp_cloud",
      name: "Cloud LLM gateway",
      type: "external",
      responsibility: "Forwards prompts to a hosted model.",
      technology: "OpenRouter",
      requirementRefs: [],
      scalingNotes: "",
    });
    model.hld.connections.push({
      id: "conn_cloud",
      fromComponentId: "cmp_api",
      toComponentId: "cmp_cloud",
      kind: "sync",
      label: "Prompt request",
      protocol: "HTTPS",
      rationale: "Model call.",
    });
  }

  it("warns when a must security NFR is unmapped and no control is named", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ nonFunctional: [securityNfr] });

    const result = validateArchitectureModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "security_nfr_uncovered",
          path: "requirements.nonFunctional(nfr_security)",
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(toValidationReport(result).valid).toBe(true);
  });

  it("accepts a mapped security NFR and still warns when only security words appear", async () => {
    const mapped = await fixture();
    mapped.model.requirements = withSpec({ nonFunctional: [securityNfr] });
    mapped.model.hld.components[1].requirementRefs = ["nfr_security"];
    expect(rules(mapped.model)).not.toContain("security_nfr_uncovered");

    // Security vocabulary in the design does not map the requirement: "No auth
    // beyond loopback" is a negated control, not coverage.
    const mentioned = await fixture();
    mentioned.model.requirements = withSpec({ nonFunctional: [securityNfr] });
    mentioned.model.hld.components[1].responsibility =
      "No auth beyond loopback; stores tool config.";
    expect(rules(mentioned.model)).toContain("security_nfr_uncovered");
  });

  it("warns when a local-only NFR meets an external component", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ nonFunctional: [localOnlyNfr] });
    addCloudComponent(model);

    const result = validateArchitectureModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "local_only_conflict",
          message: expect.stringContaining("Cloud LLM gateway"),
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
  });

  it("accepts a local-only NFR in a local architecture", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ nonFunctional: [localOnlyNfr] });
    expect(rules(model)).not.toContain("local_only_conflict");
  });

  it("warns when execution is in scope without a runtime boundary", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ functional: [executionFr] });

    const result = validateArchitectureModel(model);
    expect(result.warnings.map((warning) => warning.rule)).toContain(
      "execution_boundary_missing",
    );
    expect(result.errors).toEqual([]);
  });

  it("accepts execution when a boundary element exists", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ functional: [executionFr] });
    model.hld.components[1].responsibility =
      "Runs each tool inside a sandbox with per-tool permissions.";
    expect(rules(model)).not.toContain("execution_boundary_missing");
  });

  it("does not treat a generic tool or runtime mention as a boundary", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ functional: [executionFr] });
    model.hld.components[1].responsibility =
      "Stores tool config and selects the agent runtime.";
    expect(rules(model)).toContain("execution_boundary_missing");
  });

  it("warns when an assumption excludes execution the requirements need", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      functional: [executionFr],
      assumptions: [outOfScopeAssumption],
    });

    const result = validateArchitectureModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "execution_scope_conflict",
          path: "requirements.assumptions(asm_scope)",
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
  });

  it("accepts an out-of-scope assumption when nothing executes", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      assumptions: [outOfScopeAssumption],
    });
    expect(rules(model)).not.toContain("execution_scope_conflict");
  });

  it("does not treat generic access control or tool config as a boundary", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ functional: [executionFr] });
    model.hld.components[1].responsibility =
      "Enforces role-based access control for workspace members and stores tool config.";
    expect(rules(model)).toContain("execution_boundary_missing");
  });

  it("warns when only a clarification answer puts execution in scope", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      clarifications: [
        {
          id: "q_exec",
          question: "Does the test agent run tasks?",
          answer: "Yes, it executes shell commands and runs tests.",
        },
      ],
    });
    expect(rules(model)).toContain("execution_boundary_missing");
  });

  it("does not warn when a clarification answer puts execution out of scope", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      assumptions: [outOfScopeAssumption],
      clarifications: [
        {
          id: "q_exec",
          question: "Does the test agent execute code?",
          answer: "No, code execution is out of scope.",
        },
      ],
    });
    expect(rules(model)).not.toContain("execution_scope_conflict");
    expect(rules(model)).not.toContain("execution_boundary_missing");
  });

  it("ignores bare execution wording without an execution object", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      nonFunctional: [
        {
          id: "nfr_query",
          kind: "nonfunctional" as const,
          text: "Query execution stays under 50 ms at p95.",
          priority: "must" as const,
          category: "performance" as const,
          target: "p95 under 50 ms",
        },
      ],
    });
    expect(rules(model)).not.toContain("execution_boundary_missing");
    expect(rules(model)).not.toContain("execution_scope_conflict");
  });

  it("does not treat a support agent as code execution", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      functional: [
        {
          id: "fr_support",
          kind: "functional" as const,
          text: "Support agents can view and reply to customer tickets.",
          priority: "must" as const,
        },
      ],
      assumptions: [
        {
          id: "asm_human",
          text: "Human support agents are not included in the first release.",
        },
      ],
    });
    expect(rules(model)).not.toContain("execution_boundary_missing");
    expect(rules(model)).not.toContain("execution_scope_conflict");
  });

  it("does not treat offline support as a local-only requirement", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      nonFunctional: [
        {
          id: "nfr_offline",
          kind: "nonfunctional" as const,
          text: "The mobile client keeps working offline and syncs later.",
          priority: "should" as const,
          category: "reliability" as const,
          target: "offline edits sync within 60 s",
        },
      ],
    });
    addCloudComponent(model);
    expect(rules(model)).not.toContain("local_only_conflict");
  });

  it("does not treat a regional data rule as local-only", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({
      nonFunctional: [
        {
          id: "nfr_region",
          kind: "nonfunctional" as const,
          text: "No data leaves the EU region.",
          priority: "must" as const,
          category: "security" as const,
          target: "",
        },
      ],
    });
    model.hld.components[1].technology = "AWS ECS";
    expect(rules(model)).not.toContain("local_only_conflict");
  });

  it("detects an external dependency named only in a connection", async () => {
    const { model } = await fixture();
    model.requirements = withSpec({ nonFunctional: [localOnlyNfr] });
    model.hld.connections[0].label = "Stripe webhook";
    model.hld.connections[0].protocol = "https://api.stripe.com";

    const result = validateArchitectureModel(model);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "local_only_conflict",
          message: expect.stringContaining("Stripe webhook"),
        }),
      ]),
    );
  });

  it("surfaces the warnings from the HLD and LLD section validators", async () => {
    const { model } = await fixture();
    const localRequirements = withSpec({ nonFunctional: [localOnlyNfr] });
    addCloudComponent(model);
    expect(
      validateHldSection(model.hld, localRequirements).warnings.map(
        (warning) => warning.rule,
      ),
    ).toContain("local_only_conflict");

    const executionRequirements = withSpec({ functional: [executionFr] });
    expect(
      validateLldSection(model.lld, executionRequirements).warnings.map(
        (warning) => warning.rule,
      ),
    ).toContain("execution_boundary_missing");
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