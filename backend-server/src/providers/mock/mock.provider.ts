import { Injectable } from "@nestjs/common";
import type {
  DsaModel,
  HldModel,
  LldDsaOutput,
  LldModel,
  RequirementsAnalysisOutput,
} from "@sda/contracts";
import type {
  GenerateStructuredInput,
  GeneratedStructured,
  ModelProvider,
} from "../model-provider.js";

const USAGE = { promptTokens: 120, completionTokens: 240, totalTokens: 360 };

const REQUIREMENTS: RequirementsAnalysisOutput = {
  functional: [
    {
      text: "Users can create and organize items in a personal workspace.",
      priority: "must",
    },
    {
      text: "Users can share a workspace with collaborators.",
      priority: "should",
    },
  ],
  nonFunctional: [
    {
      text: "Common reads stay fast as the workspace grows.",
      priority: "must",
      category: "performance",
      target: "p95 read latency under 200 ms at 10k items per workspace",
    },
  ],
  assumptions: [
    "The first release is a single-region deployment.",
    "Traffic is modest enough for one API instance.",
  ],
  clarifications: ["Should sharing support per-item permissions?"],
};

const HLD: HldModel = {
  components: [
    {
      id: "cmp_client",
      name: "Web client",
      type: "client",
      responsibility: "Renders the workspace and sends user actions to the API.",
      technology: "Next.js",
      requirementRefs: [],
      scalingNotes: "Static assets served from a CDN.",
    },
    {
      id: "cmp_api",
      name: "Workspace API",
      type: "service",
      responsibility: "Validates requests and owns workspace operations.",
      technology: "NestJS",
      requirementRefs: [],
      scalingNotes: "Stateless; can run multiple instances behind a load balancer.",
    },
    {
      id: "cmp_db",
      name: "Primary database",
      type: "store",
      responsibility: "Stores workspaces, items, and memberships durably.",
      technology: "PostgreSQL",
      requirementRefs: [],
      scalingNotes: "Single primary is sufficient for the initial workload.",
    },
  ],
  connections: [
    {
      id: "conn_https",
      fromComponentId: "cmp_client",
      toComponentId: "cmp_api",
      kind: "sync",
      label: "HTTPS JSON requests",
      protocol: "HTTPS",
      rationale: "Interactive reads and writes need request/response semantics.",
    },
    {
      id: "conn_sql",
      fromComponentId: "cmp_api",
      toComponentId: "cmp_db",
      kind: "data",
      label: "SQL queries",
      protocol: "PostgreSQL protocol",
      rationale: "Relational data with transactional updates.",
    },
  ],
  flows: [
    {
      id: "flow_read",
      name: "Read workspace",
      description: "A user opens a workspace and sees its items.",
      steps: [
        {
          order: 1,
          description: "The client requests the workspace by id.",
          elementRefs: ["cmp_client", "conn_https"],
        },
        {
          order: 2,
          description: "The API loads the workspace and items.",
          elementRefs: ["cmp_api", "conn_sql", "cmp_db"],
        },
      ],
      requirementRefs: [],
    },
  ],
  technologyDecisions: [
    {
      id: "tech_db",
      topic: "Persistence",
      choice: "PostgreSQL",
      why: "Relational ownership and membership rules benefit from transactions.",
      limits: "Vertical scaling first; read replicas only when measured.",
      alternatives: [
        {
          option: "Document store",
          rejectedBecause: "Cross-entity consistency would move into application code.",
        },
      ],
    },
  ],
  scalabilityNotes: [
    {
      id: "scale_read",
      aspect: "Read latency",
      approach: "Index workspace and item lookups by workspace id.",
      limits: "Very large workspaces will need pagination.",
    },
  ],
  failureScenarios: [
    {
      id: "fail_db",
      condition: "The primary database is unavailable.",
      impact: "Reads and writes fail until the database recovers.",
      mitigation: "Surface a clear retryable error and keep the API stateless.",
      tradeOff: "No automatic failover in the first release.",
    },
  ],
};

const LLD_DSA: LldDsaOutput = {
  meta: {
    title: "Collaborative workspace",
    summary:
      "A small service-backed workspace that prioritizes clear ownership and simple persistence.",
  },
  lld: {
    classes: [
      {
        id: "cls_workspace",
        name: "Workspace",
        kind: "class",
        responsibility: "Owns items and membership for one user context.",
        requirementRefs: [],
        rationale: "A single aggregate keeps ownership rules in one place.",
        alternatives: [
          {
            option: "Item-first model",
            rejectedBecause: "Membership checks would be duplicated across item operations.",
          },
        ],
        invariants: ["A workspace always has an owner."],
        attributes: [
          {
            name: "id",
            type: "WorkspaceId",
            visibility: "private",
            static: false,
            description: "Stable identity.",
          },
        ],
        methods: [
          {
            name: "addItem",
            signature: "addItem(ownerId: UserId, item: Item): void",
            visibility: "public",
            description: "Adds an item after checking ownership.",
          },
        ],
      },
      {
        id: "cls_item",
        name: "Item",
        kind: "value_object",
        responsibility: "Immutable content owned by a workspace.",
        requirementRefs: [],
        rationale: "Value semantics keep updates explicit.",
        alternatives: [],
        invariants: ["Content is never empty."],
        attributes: [
          {
            name: "title",
            type: "string",
            visibility: "private",
            static: false,
            description: "Display title.",
          },
        ],
        methods: [],
      },
    ],
    relationships: [
      {
        id: "rel_contains",
        kind: "composition",
        sourceId: "cls_workspace",
        targetId: "cls_item",
        sourceMultiplicity: "1",
        targetMultiplicity: "0..*",
        label: "contains",
        rationale: "Items have no lifecycle outside their workspace.",
      },
    ],
    patterns: [],
  },
  dsa: {
    recommendations: [
      {
        id: "dsa_lookup",
        operation: "Fetch items for one workspace.",
        layer: "hld",
        dataStructure: "B-tree index",
        algorithm: "Index range scan ordered by workspace id.",
        complexity: {
          average: "O(log n + k) page reads",
          worst: "O(log n + k) page reads",
          notes: "k is the number of returned items; pagination bounds k.",
        },
        rationale: "The dominant access path is per-workspace listing.",
        requirementRefs: [],
        assumptions: ["Item rows are reasonably sized."],
        alternatives: [
          {
            option: "Full table scan",
            rejectedBecause: "Grows linearly with total items across all workspaces.",
          },
        ],
        limitations: ["Very large workspaces still need pagination."],
      },
    ],
    algorithmicPatterns: [],
  },
  learningSteps: [
    {
      id: "step_hld",
      title: "Start at the edge",
      explanation:
        "Requests enter through the client and reach the API over HTTPS. The API owns validation before any database work.",
      elementRefs: ["cmp_client", "cmp_api", "conn_https"],
    },
    {
      id: "step_lld",
      title: "Ownership in the model",
      explanation:
        "Workspace composes Item, so deleting a workspace removes its items instead of leaving orphans.",
      elementRefs: ["cls_workspace", "cls_item", "rel_contains"],
    },
  ],
};

/**
 * Deterministic provider for MOCK_PROVIDER=1 local demos and e2e tests. It is
 * only registered when the flag is explicitly enabled.
 */
@Injectable()
export class MockProvider implements ModelProvider {
  readonly id = "mock";

  async generateStructured(
    input: GenerateStructuredInput,
  ): Promise<GeneratedStructured> {
    switch (input.schemaName) {
      case "requirements_analysis":
        return { data: REQUIREMENTS, usage: USAGE };
      case "hld_model":
        return { data: withHldRefs(input), usage: USAGE };
      case "lld_model":
        return { data: withLldRefs(input).lld as LldModel, usage: USAGE };
      case "dsa_model":
        return { data: withLldRefs(input).dsa as DsaModel, usage: USAGE };
      case "lld_dsa_model":
        return { data: withLldRefs(input), usage: USAGE };
      default:
        throw new Error(`Mock provider has no fixture for ${input.schemaName}.`);
    }
  }
}

/** Functional requirement ids present in the prompt (confirmed spec JSON). */
function functionalIds(input: GenerateStructuredInput): string[] {
  const ids = new Set<string>();
  for (const message of input.messages) {
    for (const match of message.content.matchAll(/\bfr_[A-Za-z0-9_-]+/g)) {
      ids.add(match[0]);
    }
  }
  return [...ids];
}

/**
 * The fixtures are static, but must-have coverage is enforced by the generator.
 * Mock-only: claim every functional requirement on the API component so a mock
 * architecture stays valid for whatever ids the requirements stage produced.
 */
function withHldRefs(input: GenerateStructuredInput): HldModel {
  const hld = structuredClone(HLD);
  const ids = functionalIds(input);
  if (ids.length === 0) return hld;
  const target = hld.components.find((item) => item.id === "cmp_api") ?? hld.components[0];
  if (target) {
    target.requirementRefs = ids;
  }
  return hld;
}

function withLldRefs(input: GenerateStructuredInput): LldDsaOutput {
  const output = structuredClone(LLD_DSA);
  const ids = functionalIds(input);
  if (ids.length === 0) return output;
  const cls = output.lld.classes[0];
  if (cls) cls.requirementRefs = ids;
  const pattern = output.lld.patterns[0];
  if (pattern) pattern.requirementRefs = ids;
  const dsa = output.dsa.recommendations[0];
  if (dsa) dsa.requirementRefs = ids;
  return output;
}
