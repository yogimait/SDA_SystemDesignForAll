import { describe, expect, it } from "vitest";
import type { RequirementsSpec } from "@sda/contracts";
import { formatTokens, requirementRefLabels } from "./format";

const spec: RequirementsSpec = {
  functional: [
    { id: "fr_hashA", kind: "functional", text: "a", priority: "must" },
    { id: "fr_hashB", kind: "functional", text: "b", priority: "should" },
  ],
  nonFunctional: [
    { id: "nfr_hash", kind: "nonfunctional", text: "c", priority: "must", category: "performance", target: "" },
  ],
  clarifications: [{ id: "q_hash", question: "q?", answer: "a" }],
  assumptions: [{ id: "asm_hash", text: "assumed" }],
};

describe("formatTokens", () => {
  it("groups thousands", () => {
    expect(formatTokens(1234567)).toBe("1,234,567");
  });
});

describe("requirementRefLabels", () => {
  it("numbers every requirement kind in contract order", () => {
    const labels = requirementRefLabels(spec);
    expect(labels.get("fr_hashA")).toBe("FR 1");
    expect(labels.get("fr_hashB")).toBe("FR 2");
    expect(labels.get("nfr_hash")).toBe("NFR 1");
    expect(labels.get("q_hash")).toBe("Q 1");
    expect(labels.get("asm_hash")).toBe("A 1");
  });

  it("never returns a raw contract id", () => {
    for (const label of requirementRefLabels(spec).values()) {
      expect(label).not.toMatch(/_/);
    }
  });
});
