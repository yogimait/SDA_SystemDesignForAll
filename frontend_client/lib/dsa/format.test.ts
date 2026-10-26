/**
 * F4 checkpoint tests for DSA formatting: complexity chip wording, layer
 * attribution, trade-off rendering, stable operation grouping. Fixture in
 * tests only.
 */
import { describe, expect, it } from "vitest";
import type { DsaRecommendation } from "@sda/contracts";
import {
  complexityChips,
  groupByOperation,
  layerLabel,
  tradeOffText,
} from "./format";

const recommendation = (
  overrides: {
    id: string;
    operation?: string;
    layer?: DsaRecommendation["layer"];
    limitations?: string[];
    complexity?: DsaRecommendation["complexity"];
  },
): DsaRecommendation => {
  const operation = overrides.operation ?? "Find by id";
  const layer = overrides.layer ?? "lld";
  const limitations = overrides.limitations ?? [];
  const complexity = overrides.complexity ?? { average: "O(1)", worst: "O(n)", notes: "" };
  return {
    id: overrides.id,
    operation,
    layer,
    dataStructure: "Hash map",
    algorithm: "direct lookup",
    complexity,
    rationale: "constant lookups",
    requirementRefs: [],
    assumptions: [],
    alternatives: [],
    limitations,
  };
};

describe("complexityChips", () => {
  it("renders explicit average/worst wording on separate chips", () => {
    const chips = complexityChips({ average: "O(log n)", worst: "O(n)", notes: "end-to-end latency adds network hops" });
    expect(chips.average).toBe("avg O(log n)");
    expect(chips.worst).toBe("worst O(n)");
  });

  it("passes the caveat note through untouched", () => {
    const note = "end-to-end latency adds network hops";
    expect(complexityChips({ average: "O(1)", worst: "O(n)", notes: note }).worst !== note).toBe(true);
    // The caller renders notes as its own text; the chips never swallow them.
    expect(complexityChips({ average: "O(1)", worst: "O(n)", notes: note })).toEqual({
      average: "avg O(1)",
      worst: "worst O(n)",
    });
  });
});

describe("layerLabel", () => {
  it("attributes every contract layer", () => {
    expect(layerLabel("lld")).toBe("LLD layer");
    expect(layerLabel("hld")).toBe("HLD layer");
    expect(layerLabel("shared")).toBe("Shared LLD + HLD");
  });
});

describe("tradeOffText", () => {
  it("uses the first limitation for the table column", () => {
    expect(tradeOffText(recommendation({ id: "dsa_1", limitations: ["unbounded memory", "no eviction"] }))).toBe(
      "unbounded memory",
    );
  });

  it("falls back to a dash when no limitations exist", () => {
    expect(tradeOffText(recommendation({ id: "dsa_2" }))).toBe("—");
  });
});

describe("groupByOperation", () => {
  it("groups by operation keeping first-appearance order", () => {
    const groups = groupByOperation([
      recommendation({ id: "dsa_a", operation: "Add item" }),
      recommendation({ id: "dsa_b", operation: "Find item" }),
      recommendation({ id: "dsa_c", operation: "Add item", layer: "hld" }),
    ]);
    expect(groups.map((group) => group.operation)).toEqual(["Add item", "Find item"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["dsa_a", "dsa_c"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["dsa_b"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByOperation([])).toEqual([]);
  });
});
