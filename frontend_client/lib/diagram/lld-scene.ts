/**
 * LLD scene graph: canonical LldModel → positioned nodes + routed edges for
 * the SVG canvas (F3). Pure and deterministic: inputs are sorted, dagre
 * layout is seed-free, so the same model always yields the same scene.
 * No React here — canvas and tests share this module.
 */
import dagre from "@dagrejs/dagre";
import type {
  ClassKind,
  LldClass,
  LldModel,
  RelationshipKind,
} from "@sda/contracts";

export type SceneNode = {
  id: string;
  name: string;
  kind: ClassKind;
  /** UML member lines (attribute or method), preformatted. */
  memberLines: string[];
  /** members[0..attributeCount) are attributes, the rest methods. */
  attributeCount: number;
  hasMethods: boolean;
  /** Top-left corner in scene coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneEdge = {
  id: string;
  kind: RelationshipKind;
  from: string;
  to: string;
  /** Label next to the middle of the edge (empty = none). */
  label: string;
  fromMultiplicity: string;
  toMultiplicity: string;
  /** Polyline points from dagre (border to border). */
  points: Array<{ x: number; y: number }>;
};

export type LldScene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  width: number;
  height: number;
};

const NODE_WIDTH = 240;
const NODE_MAX_WIDTH = 460;
const HEADER_HEIGHT = 40;
const MEMBER_LINE_HEIGHT = 18;
const COMPARTMENT_PADDING = 10;

/**
 * Per-class width: fits the longest member line (10.5px mono) and the name
 * (12.5px semibold) on one line each, clamped to a sane band. Approximate
 * glyph advances; keeps long signatures from spilling over other nodes.
 */
function nodeWidth(cls: LldClass): number {
  const fields = nodeMemberFields(cls);
  const longest = Math.max(
    cls.name.length * 7.2,
    0,
    ...fields.attributes.map((line) => line.length * 6.3),
    ...fields.methods.map((line) => line.length * 6.3),
  );
  return Math.min(NODE_MAX_WIDTH, Math.max(NODE_WIDTH, Math.ceil(longest) + 28));
}

export const VISIBILITY_GLYPH: Record<string, string> = {
  public: "+",
  private: "-",
  protected: "#",
  package: "~",
};

export const KIND_STEREOTYPE: Record<ClassKind, string> = {
  class: "",
  abstract: "abstract",
  interface: "interface",
  enum: "enumeration",
  value_object: "value object",
};

/** Stable marker ids referenced by the SVG <defs> in DiagramCanvas. */
export const MARKER_BY_KIND: Record<RelationshipKind, string> = {
  inheritance: "marker-inheritance",
  realization: "marker-realization",
  association: "marker-association",
  aggregation: "marker-aggregation",
  composition: "marker-composition",
  dependency: "marker-dependency",
};

export function attributeText(attr: LldClass["attributes"][number]): string {
  return `${VISIBILITY_GLYPH[attr.visibility] ?? "+"}${attr.static ? "static " : ""}${attr.name}: ${attr.type}`;
}

/** The contract defines `signature` as the full signature string (mock agrees: `addItem(ownerId: UserId, item: Item): void`). */
export function methodText(method: LldClass["methods"][number]): string {
  return `${VISIBILITY_GLYPH[method.visibility] ?? "+"}${method.name}${method.signature}`;
}

function nodeHeight(cls: LldClass): number {
  const members = cls.attributes.length + cls.methods.length;
  return HEADER_HEIGHT + members * MEMBER_LINE_HEIGHT + COMPARTMENT_PADDING * 2;
}

/** Node box member lines, shared by canvas renderer and tests. */
export function nodeMemberFields(cls: LldClass): {
  attributes: string[];
  methods: string[];
} {
  return {
    attributes: cls.attributes.map((attr) => attributeText(attr)),
    methods: cls.methods.map((method) => methodText(method)),
  };
}

/**
 * Build the laid-out scene. `rankdir: BT` keeps parents above children so the
 * inheritance triangle points up, per convention. Edges keep dagre's
 * border-to-border polylines.
 */
export function buildLldScene(model: LldModel): LldScene {
  const graph = new dagre.graphlib.Graph({ multigraph: true, compound: false })
    .setGraph({ rankdir: "BT", nodesep: 36, ranksep: 70, marginx: 24, marginy: 24 })
    .setDefaultEdgeLabel(() => ({}));

  const classes = [...model.classes].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const cls of classes) {
    graph.setNode(cls.id, {
      width: nodeWidth(cls),
      height: nodeHeight(cls),
    });
  }

  const relationships = [...model.relationships].sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );
  for (const rel of relationships) {
    graph.setEdge(rel.sourceId, rel.targetId, {}, rel.id);
  }

  dagre.layout(graph);

  const nodes: SceneNode[] = classes.map((cls) => {
    const laid = graph.node(cls.id);
    const fields = nodeMemberFields(cls);
    const height = nodeHeight(cls);
    const width = nodeWidth(cls);
    return {
      id: cls.id,
      name: cls.name,
      kind: cls.kind,
      memberLines: [...fields.attributes, ...fields.methods],
      attributeCount: cls.attributes.length,
      hasMethods: cls.methods.length > 0,
    // dagre reports node centers; convert to top-left.
      x: (laid.x ?? 0) - width / 2,
      y: (laid.y ?? 0) - height / 2,
      width,
      height,
    };
  });

  const edges: SceneEdge[] = [];
  for (const rel of relationships) {
    const laid = graph.edge(rel.sourceId, rel.targetId, rel.id);
    if (laid === undefined) continue;
    edges.push({
      id: rel.id,
      kind: rel.kind,
      from: rel.sourceId,
      to: rel.targetId,
      label: rel.label,
      fromMultiplicity: rel.sourceMultiplicity,
      toMultiplicity: rel.targetMultiplicity,
      points: laid.points ?? [],
    });
  }

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width);
    height = Math.max(height, node.y + node.height);
  }

  return { nodes, edges, width, height };
}

/**
 * Which scene ids are "related" to a selection:
 * - a selected class → its incident relationship ids + their other endpoints
 * - a selected pattern → its participant class ids (canvas highlight)
 */
export function relatedElements(
  model: LldModel,
  selected: { type: "class" | "relationship" | "pattern"; id: string } | null,
): { relationshipIds: Set<string>; classIds: Set<string> } {
  const relationshipIds = new Set<string>();
  const classIds = new Set<string>();
  if (selected === null) return { relationshipIds, classIds };

  if (selected.type === "class") {
    for (const rel of model.relationships) {
      if (rel.sourceId === selected.id || rel.targetId === selected.id) {
        relationshipIds.add(rel.id);
        classIds.add(rel.sourceId);
        classIds.add(rel.targetId);
      }
    }
  } else if (selected.type === "pattern") {
    const pattern = model.patterns.find((p) => p.id === selected.id);
    if (pattern !== undefined) {
      for (const id of pattern.participantClassIds) classIds.add(id);
    }
  }
  return { relationshipIds, classIds };
}
