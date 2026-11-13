import { describe, expect, it } from "vitest";
import type { HldModel, LldModel } from "@sda/contracts";
import { buildHldScene } from "../diagram/hld-scene";
import { buildLldScene } from "../diagram/lld-scene";
import {
  EXPORT_DIAGRAM_ASPECT,
  buildExportHldScene,
  buildExportLldScene,
  pickByAspect,
} from "./orientation";

function cls(id: string, name: string) {
  return {
    id,
    name,
    kind: "class" as const,
    responsibility: `${name} does its part.`,
    requirementRefs: [],
    rationale: "Test fixture.",
    alternatives: [],
    invariants: [],
    attributes: [],
    methods: [],
  };
}

function rel(id: string, sourceId: string, targetId: string) {
  return {
    id,
    kind: "association" as const,
    sourceId,
    targetId,
    sourceMultiplicity: "1" as const,
    targetMultiplicity: "0..*" as const,
    label: "",
    rationale: "Fixture link.",
  };
}

/** Hub + three leaves: wide in BT (leaves side by side), shallow in LR. */
const starLld: LldModel = {
  classes: [
    cls("cls_1", "Hub"),
    cls("cls_2", "Leaf A"),
    cls("cls_3", "Leaf B"),
    cls("cls_4", "Leaf C"),
  ],
  relationships: [
    rel("rel_1", "cls_1", "cls_2"),
    rel("rel_2", "cls_1", "cls_3"),
    rel("rel_3", "cls_1", "cls_4"),
  ],
  patterns: [],
};

const chainHld: HldModel = {
  components: [
    {
      id: "cmp_1",
      name: "Client",
      type: "client",
      responsibility: "Calls the gateway.",
      technology: "",
      requirementRefs: [],
      scalingNotes: "",
    },
    {
      id: "cmp_2",
      name: "Gateway",
      type: "gateway",
      responsibility: "Routes calls.",
      technology: "nginx",
      requirementRefs: [],
      scalingNotes: "",
    },
    {
      id: "cmp_3",
      name: "Store",
      type: "store",
      responsibility: "Holds state.",
      technology: "postgres",
      requirementRefs: [],
      scalingNotes: "",
    },
  ],
  connections: [
    {
      id: "conn_1",
      fromComponentId: "cmp_1",
      toComponentId: "cmp_2",
      kind: "sync",
      label: "request",
      protocol: "http",
      rationale: "Synchronous call.",
    },
    {
      id: "conn_2",
      fromComponentId: "cmp_2",
      toComponentId: "cmp_3",
      kind: "sync",
      label: "read",
      protocol: "sql",
      rationale: "Synchronous read.",
    },
  ],
  flows: [],
  technologyDecisions: [],
  scalabilityNotes: [],
  failureScenarios: [],
};

function aspect(scene: { width: number; height: number }): number {
  return scene.width / scene.height;
}

describe("export diagram orientation", () => {
  it("picks the candidate whose aspect is closest to the printable box", () => {
    const wide = { rankdir: "LR", scene: { width: 300, height: 100 } }; // aspect 3.0
    const near = { rankdir: "TB", scene: { width: 75, height: 100 } }; // aspect 0.75
    expect(pickByAspect([wide, near], 1.5)).toBe(near);
    expect(pickByAspect([near, wide], 1.5)).toBe(near);
  });

  it("breaks ties toward the first candidate (the workspace default)", () => {
    const equalA = { rankdir: "BT", scene: { width: 200, height: 100 } }; // aspect 2.0
    const equalB = { rankdir: "LR", scene: { width: 400, height: 200 } }; // aspect 2.0
    expect(pickByAspect([equalA, equalB], 1.5)).toBe(equalA);
    expect(pickByAspect([equalB, equalA], 1.5)).toBe(equalB);
  });

  it("LLD export flips the star fixture to LR: closer to the box than the BT default", () => {
    const pick = buildExportLldScene(starLld);
    expect(pick.rankdir).toBe("LR");
    expect(pick.scene).toEqual(buildLldScene(starLld, { rankdir: "LR" }));
    expect(Math.abs(aspect(pick.scene) - EXPORT_DIAGRAM_ASPECT)).toBeLessThan(
      Math.abs(aspect(buildLldScene(starLld)) - EXPORT_DIAGRAM_ASPECT),
    );
  });

  it("HLD export picks TB for a vertical chain: closer to the box than the LR default", () => {
    const pick = buildExportHldScene(chainHld);
    expect(pick.rankdir).toBe("TB");
    expect(pick.scene).toEqual(buildHldScene(chainHld, { rankdir: "TB" }));
    expect(Math.abs(aspect(pick.scene) - EXPORT_DIAGRAM_ASPECT)).toBeLessThan(
      Math.abs(aspect(buildHldScene(chainHld)) - EXPORT_DIAGRAM_ASPECT),
    );
  });

  it("keeps the workspace defaults: LLD BT, HLD LR", () => {
    expect(buildLldScene(starLld)).toEqual(buildLldScene(starLld, { rankdir: "BT" }));
    expect(buildHldScene(chainHld)).toEqual(buildHldScene(chainHld, { rankdir: "LR" }));
  });
});
