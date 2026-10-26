/**
 * F4 checkpoint tests for the HLD scene mapping: marker/dash/icon maps for
 * every connection kind and component type, deterministic layout, edge
 * routing, and the flow→element highlight mapping (correct ids in order).
 * Fixture is handwritten (fixtures belong in tests only).
 */
import { describe, expect, it } from "vitest";
import type { HldComponent, HldConnection, HldModel } from "@sda/contracts";
import {
  buildHldScene,
  flowHighlight,
  hldAdjacency,
  hldFocusBoundingBox,
  HLD_EDGE_DASH,
  HLD_MARKER_BY_KIND,
  hldNodeHeight,
  hldNodeWidth,
  HLD_NODE_WIDTH,
} from "./hld-scene";

const component = (over: {
  id: string;
  name: string;
  type: HldComponent["type"];
  technology?: string;
}): HldComponent => ({
  responsibility: `${over.name} does its job`,
  technology: "",
  requirementRefs: [],
  scalingNotes: "",
  ...over,
});

const connection = (over: {
  id: string;
  fromComponentId: string;
  toComponentId: string;
  kind: HldConnection["kind"];
  label?: string;
  protocol?: string;
}): HldConnection => ({
  label: "calls",
  protocol: "",
  rationale: "why this connection",
  ...over,
});

const fixture: HldModel = {
  components: [
    component({ id: "cmp_api", name: "IdeaService", type: "service" }),
    component({ id: "cmp_client", name: "Web app", type: "client", technology: "Browser SPA" }),
    component({ id: "cmp_db", name: "Postgres", type: "store", technology: "Postgres 16" }),
    component({ id: "cmp_gw", name: "API gateway", type: "gateway", technology: "REST gateway" }),
    component({ id: "cmp_obs", name: "Collector", type: "observability", technology: "OTel" }),
    component({ id: "cmp_pay", name: "Stripe", type: "external", technology: "Stripe API" }),
    component({ id: "cmp_queue", name: "Events", type: "broker", technology: "Kafka" }),
    component({ id: "cmp_redis", name: "Hot cache", type: "cache", technology: "Redis" }),
    component({ id: "cmp_worker", name: "Jobs", type: "worker" }),
  ],
  connections: [
    connection({ id: "conn_1", fromComponentId: "cmp_client", toComponentId: "cmp_gw", kind: "sync", label: "submits idea", protocol: "HTTPS" }),
    connection({ id: "conn_2", fromComponentId: "cmp_gw", toComponentId: "cmp_api", kind: "sync", label: "serves REST", protocol: "HTTP" }),
    connection({ id: "conn_3", fromComponentId: "cmp_gw", toComponentId: "cmp_queue", kind: "async", label: "fan-out events" }),
    connection({ id: "conn_4", fromComponentId: "cmp_queue", toComponentId: "cmp_worker", kind: "async", label: "consume jobs" }),
    connection({ id: "conn_5", fromComponentId: "cmp_api", toComponentId: "cmp_db", kind: "data", label: "reads/writes rows" }),
    connection({ id: "conn_6", fromComponentId: "cmp_api", toComponentId: "cmp_redis", kind: "sync", label: "hot reads" }),
    connection({ id: "conn_7", fromComponentId: "cmp_worker", toComponentId: "cmp_db", kind: "data", label: "writes results" }),
    connection({ id: "conn_8", fromComponentId: "cmp_worker", toComponentId: "cmp_pay", kind: "sync", label: "charges card" }),
    connection({ id: "conn_9", fromComponentId: "cmp_api", toComponentId: "cmp_db", kind: "sync", label: "validate schema" }),
    connection({ id: "conn_10", fromComponentId: "cmp_api", toComponentId: "cmp_obs", kind: "data", label: "spans" }),
  ],
  flows: [
    {
      id: "flow_1",
      name: "Submit idea",
      description: "End-to-end sync write path",
      steps: [
        { order: 1, description: "User submits", elementRefs: ["cmp_client", "conn_1"] },
        { order: 2, description: "Gateway routes", elementRefs: ["cmp_gw", "conn_2"] },
        { order: 3, description: "Service persists", elementRefs: ["cmp_api", "conn_5", "conn_2", "cmp_gw"] },
      ],
      requirementRefs: ["fr_u1"],
    },
    {
      id: "flow_2",
      name: "Async fan-out",
      description: "Event path",
      steps: [
        { order: 1, description: "Gateway emits", elementRefs: ["cmp_gw", "conn_3", "unrelated_ref"] },
      ],
      requirementRefs: [],
    },
  ],
  technologyDecisions: [],
  scalabilityNotes: [],
  failureScenarios: [],
};

describe("marker and dash maps", () => {
  it("maps every connection kind to a unique marker id and dash style", () => {
    expect(Object.keys(HLD_MARKER_BY_KIND).sort()).toEqual(["async", "data", "sync"]);
    expect(new Set(Object.values(HLD_MARKER_BY_KIND)).size).toBe(3);
    expect(HLD_EDGE_DASH.sync).toBeUndefined();
    expect(HLD_EDGE_DASH.async).toBe("6 3");
    expect(HLD_EDGE_DASH.data).toBe("2 3");
  });
});

describe("buildHldScene", () => {
  it("lays out one node per component with computed geometry", () => {
    const scene = buildHldScene(fixture);
    expect(scene.nodes).toHaveLength(9);
    expect(scene.edges).toHaveLength(10);

    const api = scene.nodes.find((node) => node.id === "cmp_api")!;
    expect(api.width).toBe(210);
    expect(api.height).toBe(54); // no technology line
    const db = scene.nodes.find((node) => node.id === "cmp_db")!;
    expect(db.height).toBe(67); // 54 + 13 technology line
    expect(db.technology).toBe("Postgres 16");

    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });

  it("reports the technology-line height helper consistently", () => {
    expect(hldNodeHeight("")).toBe(54);
    expect(hldNodeHeight("Kafka")).toBe(67);
  });

  it("widens nodes for long labels and keeps short ones at the minimum", () => {
    expect(hldNodeWidth("Web app", "Browser SPA")).toBe(HLD_NODE_WIDTH);
    const longName = "Reverse proxy (nginx ingress controller)";
    const longTech = "HAProxy with connection pooling";
    const width = hldNodeWidth(longName, longTech);
    expect(width).toBeGreaterThan(HLD_NODE_WIDTH);
    expect(width).toBeLessThanOrEqual(320);

    const scene = buildHldScene({
      ...fixture,
      components: [
        ...fixture.components,
        component({ id: "cmp_proxy", name: longName, type: "gateway", technology: longTech }),
      ],
    });
    const proxy = scene.nodes.find((node) => node.id === "cmp_proxy")!;
    expect(proxy.width).toBe(width);
  });

  it("is deterministic: two runs produce identical scenes", () => {
    expect(buildHldScene(fixture)).toEqual(buildHldScene(fixture));
  });

  it("routes every connection, keeps labels/protocols, and preserves parallel edges", () => {
    const scene = buildHldScene(fixture);
    for (const edge of scene.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(HLD_MARKER_BY_KIND[edge.kind]).toMatch(/^hld-marker-/);
    }
    const first = scene.edges.find((edge) => edge.id === "conn_1")!;
    expect(first.label).toBe("submits idea");
    expect(first.protocol).toBe("HTTPS");

    const apiToDb = scene.edges.filter((edge) => edge.from === "cmp_api" && edge.to === "cmp_db");
    expect(apiToDb.map((edge) => edge.id).sort()).toEqual(["conn_5", "conn_9"]);
  });
});

describe("flowHighlight", () => {
  it("collects element ids in step order with first-occurrence dedup", () => {
    const full = flowHighlight(fixture, "flow_1");
    expect(full.componentIds).toEqual(["cmp_client", "cmp_gw", "cmp_api"]);
    expect(full.connectionIds).toEqual(["conn_1", "conn_2", "conn_5"]);
  });

  it("focuses a single step by index (order-1 based steps)", () => {
    const focused = flowHighlight(fixture, "flow_1", 2); // step with order 3
    expect(focused.componentIds).toEqual(["cmp_api", "cmp_gw"]);
    expect(focused.connectionIds).toEqual(["conn_5", "conn_2"]);
  });

  it("tolerates unknown refs and unknown flow ids", () => {
    const { componentIds, connectionIds } = flowHighlight(fixture, "flow_2");
    expect(componentIds).toEqual(["cmp_gw"]);
    expect(connectionIds).toEqual(["conn_3"]); // ref "unrelated_ref" ignored

    expect(flowHighlight(fixture, "flow_missing")).toEqual({ componentIds: [], connectionIds: [] });
  });
});

describe("hldAdjacency", () => {
  it("collects incident connections and neighbours for a component", () => {
    const { componentIds, connectionIds } = hldAdjacency(fixture, { type: "component", id: "cmp_api" });
    expect([...connectionIds].sort()).toEqual(["conn_10", "conn_2", "conn_5", "conn_6", "conn_9"]);
    expect([...componentIds].sort()).toEqual(["cmp_api", "cmp_db", "cmp_gw", "cmp_obs", "cmp_redis"]);
  });

  it("collects the two endpoints for a connection", () => {
    const { componentIds, connectionIds } = hldAdjacency(fixture, { type: "connection", id: "conn_8" });
    expect([...connectionIds]).toEqual(["conn_8"]);
    expect([...componentIds].sort()).toEqual(["cmp_pay", "cmp_worker"]);
  });
});

describe("hldFocusBoundingBox", () => {
  const scene = buildHldScene(fixture);

  it("bounds the guided step's nodes and edge points with padding", () => {
    const box = hldFocusBoundingBox(scene, new Set(["cmp_client", "cmp_gw"]), new Set(["conn_1"]));
    expect(box).not.toBeNull();
    const nodes = scene.nodes.filter((n) => ["cmp_client", "cmp_gw"].includes(n.id));
    const edge = scene.edges.find((e) => e.id === "conn_1");
    expect(edge).toBeDefined();
    const points = edge?.points ?? [];
    const minX = Math.min(...nodes.map((n) => n.x), ...points.map((p) => p.x));
    const minY = Math.min(...nodes.map((n) => n.y), ...points.map((p) => p.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width), ...points.map((p) => p.x));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height), ...points.map((p) => p.y));
    expect(box?.x).toBe(minX - 48);
    expect(box?.y).toBe(minY - 48);
    expect(box?.width).toBe(maxX - minX + 96);
    expect(box?.height).toBe(maxY - minY + 96);
  });

  it("returns null when nothing matches", () => {
    expect(hldFocusBoundingBox(scene, new Set(["cmp_missing"]), new Set())).toBeNull();
  });
});
