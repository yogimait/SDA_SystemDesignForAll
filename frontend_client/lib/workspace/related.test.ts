import { describe, expect, it } from "vitest";
import {
  relatedByRefs,
  relatedHldComponents,
  relatedLldClasses,
} from "./related";

const cls = (id: string, refs: string[]) => ({
  id,
  name: id,
  kind: "class" as const,
  responsibility: "r",
  requirementRefs: refs,
  rationale: "",
  alternatives: [],
  invariants: [],
  attributes: [],
  methods: [],
});

const cmp = (id: string, refs: string[]) => ({
  id,
  name: id,
  type: "service" as const,
  responsibility: "r",
  technology: "",
  requirementRefs: refs,
  scalingNotes: "",
});

describe("relatedByRefs", () => {
  it("returns only items sharing at least one ref", () => {
    const items = [cls("cls_a", ["fr_1"]), cls("cls_b", ["fr_2"]), cls("cls_c", ["fr_1", "fr_3"])];
    expect(relatedByRefs(["fr_1"], items).map((i) => i.id)).toEqual(["cls_a", "cls_c"]);
  });

  it("returns nothing for an element with no requirement refs", () => {
    expect(relatedByRefs([], [cls("cls_a", ["fr_1"])])).toEqual([]);
  });

  it("returns nothing when no ref intersects", () => {
    expect(relatedByRefs(["fr_9"], [cls("cls_a", ["fr_1"])])).toEqual([]);
  });

  it("preserves input order (model order, not ref order)", () => {
    const items = [cls("cls_z", ["fr_2"]), cls("cls_a", ["fr_1"])];
    expect(relatedByRefs(["fr_2", "fr_1"], items).map((i) => i.id)).toEqual(["cls_z", "cls_a"]);
  });
});

describe("relatedLldClasses / relatedHldComponents", () => {
  it("links component → classes and class → components symmetrically", () => {
    const component = cmp("cmp_1", ["fr_1"]);
    const classes = [cls("cls_1", ["fr_1"]), cls("cls_2", ["fr_2"])];
    expect(relatedLldClasses(component, classes).map((c) => c.id)).toEqual(["cls_1"]);

    expect(
      relatedHldComponents(classes[0]!, [component, cmp("cmp_2", ["fr_2"])]).map((c) => c.id),
    ).toEqual(["cmp_1"]);
  });

  it("handles components with no refs without matching everything", () => {
    const classes = [cls("cls_1", ["fr_1"])];
    expect(relatedLldClasses(cmp("cmp_1", []), classes)).toEqual([]);
  });
});
