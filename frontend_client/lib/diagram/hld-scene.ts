/**
 * HLD scene graph: canonical HldModel → positioned nodes + routed edges for
 * the SVG canvas (F4). Pure and deterministic like lld-scene: inputs are
 * sorted, dagre layout is seed-free. No React here — canvas and tests share
 * this module.
 */
import dagre from "@dagrejs/dagre";
import type {
  ComponentType,
  ConnectionKind,
  HldModel,
} from "@sda/contracts";

export type HldSceneNode = {
  id: string;
  name: string;
  type: ComponentType;
  technology: string;
  /** Top-left corner in scene coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HldSceneEdge = {
  id: string;
  from: string;
  to: string;
  kind: ConnectionKind;
  label: string;
  protocol: string;
  /** Polyline points from dagre (border to border). */
  points: Array<{ x: number; y: number }>;
};

export type HldScene = {
  nodes: HldSceneNode[];
  edges: HldSceneEdge[];
  width: number;
  height: number;
};

export const HLD_NODE_WIDTH = 210;

/** Header (chip + name) height; technology adds one mono line below. */
export const HLD_BASE_HEIGHT = 54;
export const HLD_TECH_LINE_HEIGHT = 13;

export function hldNodeHeight(technology: string): number {
  return HLD_BASE_HEIGHT + (technology === "" ? 0 : HLD_TECH_LINE_HEIGHT);
}

/**
 * Per-node width: wide enough for the name (12.5px semibold) and technology
 * (10px mono) on one line each, clamped to a sane band. Approximate glyph
 * advances; content beyond the band's budget is truncated in `fitLabels`
 * because overflowing text would paint across neighbouring nodes.
 */
export function hldNodeWidth(name: string, technology: string): number {
  const longest = Math.max(
    name.length * 7.2,
    technology.length * 6.1,
  );
  return Math.min(320, Math.max(HLD_NODE_WIDTH, Math.ceil(longest) + 30));
}

function truncateTo(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Name + technology truncated to the character budget the width allows. */
function fitLabels(name: string, technology: string, width: number): {
  name: string;
  technology: string;
} {
  return {
    name: truncateTo(
      name,
      Math.max(8, Math.floor((width - 28) / 7.2)),
    ),
    technology: truncateTo(
      technology,
      Math.max(8, Math.floor((width - 28) / 6.1)),
    ),
  };
}

/** Stable marker ids referenced by the HLD canvas <defs>. */
export const HLD_MARKER_BY_KIND: Record<ConnectionKind, string> = {
  sync: "hld-marker-sync",
  async: "hld-marker-async",
  data: "hld-marker-data",
};

/** Sync = solid, async = long dashes, data = dotted (plus the printed label). */
export const HLD_EDGE_DASH: Record<ConnectionKind, string | undefined> = {
  sync: undefined,
  async: "6 3",
  data: "2 3",
};

/**
 * Ordered element refs for a flow, classified by canonical id prefix.
 * Full path = refs of every step in step order, deduped on first occurrence.
 * Focused step (stepIndex given) = only that step's elements.
 * Unknown ids are tolerated (prefix-classified) like relatedElements.
 */
export function flowHighlight(
  hld: HldModel,
  flowId: string,
  stepIndex?: number,
): { componentIds: string[]; connectionIds: string[] } {
  const flow = hld.flows.find((f) => f.id === flowId);
  if (flow === undefined) return { componentIds: [], connectionIds: [] };

  const steps = flow.steps.filter((step) => stepIndex === undefined || step.order === stepIndex + 1);
  steps.sort((a, b) => a.order - b.order);

  const componentIds = new Set<string>();
  const connectionIds = new Set<string>();
  for (const step of steps) {
    for (const ref of step.elementRefs) {
      if (ref.startsWith("cmp_") && !componentIds.has(ref)) componentIds.add(ref);
      else if (ref.startsWith("conn_") && !connectionIds.has(ref)) connectionIds.add(ref);
    }
  }
  return { componentIds: [...componentIds], connectionIds: [...connectionIds] };
}

/** Adjacency for component/connection selection (dim non-incident elements). */
export function hldAdjacency(
  hld: HldModel,
  selection: { type: "component" | "connection"; id: string },
): { componentIds: Set<string>; connectionIds: Set<string> } {
  const componentIds = new Set<string>();
  const connectionIds = new Set<string>();
  for (const conn of hld.connections) {
    const incident =
      (selection.type === "component" &&
        (conn.fromComponentId === selection.id || conn.toComponentId === selection.id)) ||
      (selection.type === "connection" && conn.id === selection.id);
    if (!incident) continue;
    connectionIds.add(conn.id);
    componentIds.add(conn.fromComponentId);
    componentIds.add(conn.toComponentId);
  }
  if (selection.type === "component") componentIds.add(selection.id);
  return { componentIds, connectionIds };
}

/**
 * Bounding box around a guided step's HLD elements (nodes + edge points),
 * padded like the LLD focus box so the step fills the viewport.
 */
export function hldFocusBoundingBox(
  scene: HldScene,
  componentIds: Set<string>,
  connectionIds: Set<string>,
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  const widen = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  };
  for (const node of scene.nodes) {
    if (!componentIds.has(node.id)) continue;
    widen(node.x, node.y);
    widen(node.x + node.width, node.y + node.height);
  }
  for (const edge of scene.edges) {
    if (!connectionIds.has(edge.id)) continue;
    for (const point of edge.points) widen(point.x, point.y);
  }
  if (!any) return null;
  const pad = 48;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function buildHldScene(hld: HldModel): HldScene {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const components = [...hld.components].sort((a, b) => a.id.localeCompare(b.id));
  for (const component of components) {
    graph.setNode(component.id, {
      width: hldNodeWidth(component.name, component.technology),
      height: hldNodeHeight(component.technology),
    });
  }

  const connections = [...hld.connections].sort((a, b) => a.id.localeCompare(b.id));
  for (const conn of connections) {
    graph.setEdge(conn.fromComponentId, conn.toComponentId, {}, conn.id);
  }

  dagre.layout(graph);

  const nodes: HldSceneNode[] = [];
  for (const component of components) {
    const laid = graph.node(component.id) as { x?: number; y?: number };
    const width = hldNodeWidth(component.name, component.technology);
    const fitted = fitLabels(component.name, component.technology, width);
    nodes.push({
      id: component.id,
      name: fitted.name,
      type: component.type,
      technology: fitted.technology,
      // dagre reports node centers; convert to top-left.
      x: (laid.x ?? 0) - width / 2,
      y: (laid.y ?? 0) - hldNodeHeight(component.technology) / 2,
      width,
      height: hldNodeHeight(component.technology),
    });
  }

  const width = Math.ceil(graph.graph().width ?? 0);
  const height = Math.ceil(graph.graph().height ?? 0);

  const edges: HldSceneEdge[] = [];
  for (const conn of connections) {
    const laid = graph.edge(conn.fromComponentId, conn.toComponentId, conn.id);
    if (laid === undefined) continue;
    edges.push({
      id: conn.id,
      from: conn.fromComponentId,
      to: conn.toComponentId,
      kind: conn.kind,
      label: conn.label,
      protocol: conn.protocol,
      points: laid.points ?? [],
    });
  }

  return { nodes, edges, width, height };
}
