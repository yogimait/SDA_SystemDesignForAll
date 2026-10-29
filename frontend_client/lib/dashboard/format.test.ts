import { describe, expect, it } from "vitest";
import {
  bucketLabelStep,
  bucketTickIndices,
  formatTokensCompact,
  rangeLabel,
  sortRunsNewestFirst,
  usageBarPercent,
} from "./format";

describe("formatTokensCompact", () => {
  it("formats small counts plainly", () => {
    expect(formatTokensCompact(0)).toBe("0");
    expect(formatTokensCompact(42)).toBe("42");
  });

  it("groups thousands", () => {
    expect(formatTokensCompact(1234)).toBe("1,234");
    expect(formatTokensCompact(999_999)).toBe("999,999");
  });

  it("condenses millions with one decimal", () => {
    expect(formatTokensCompact(1_200_340)).toBe("1.2M");
    expect(formatTokensCompact(12_000_000)).toBe("12M");
  });
});

describe("rangeLabel", () => {
  it("maps every dashboard range to a label", () => {
    expect(rangeLabel("last_7_days")).toBe("Last 7 days");
    expect(rangeLabel("last_30_days")).toBe("Last 30 days");
    expect(rangeLabel("last_90_days")).toBe("Last 90 days");
  });
});

describe("sortRunsNewestFirst", () => {
  it("sorts by createdAt descending without mutating the input", () => {
    const runs = [
      { id: "a", createdAt: "2026-01-02T00:00:00Z" },
      { id: "b", createdAt: "2026-01-03T00:00:00Z" },
      { id: "c", createdAt: "2026-01-01T00:00:00Z" },
    ];
    const sorted = sortRunsNewestFirst(runs);
    expect(sorted.map((run) => run.id)).toEqual(["b", "a", "c"]);
    expect(runs.map((run) => run.id)).toEqual(["a", "b", "c"]);
  });
});

describe("usageBarPercent", () => {
  it("scales a value against the leading model", () => {
    expect(usageBarPercent(500, 1000)).toBe(50);
    expect(usageBarPercent(1000, 1000)).toBe(100);
  });

  it("is zero for empty usage", () => {
    expect(usageBarPercent(0, 0)).toBe(0);
  });
});

describe("bucketLabelStep", () => {
  it("labels weekly ranges daily and steps longer ranges", () => {
    expect(bucketLabelStep(0)).toBe(1);
    expect(bucketLabelStep(7)).toBe(1);
    expect(bucketLabelStep(30)).toBe(5);
    expect(bucketLabelStep(90)).toBe(15);
    expect(bucketLabelStep(92)).toBe(15);
  });
});

describe("bucketTickIndices", () => {
  it("labels weekly ranges daily", () => {
    expect(bucketTickIndices(7, 1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("steps 30-day ranges at 5 with the last day anchored", () => {
    expect(bucketTickIndices(30, 5)).toEqual([0, 5, 10, 15, 20, 25, 29]);
    expect(bucketTickIndices(29, 5)).toEqual([0, 5, 10, 15, 20, 25, 28]);
  });

  it("keeps the anchor when the last bucket is already ticked", () => {
    expect(bucketTickIndices(7, 4)).toEqual([0, 4, 6]);
  });

  it("handles empty ranges", () => {
    expect(bucketTickIndices(0, 5)).toEqual([]);
    expect(bucketTickIndices(1, 5)).toEqual([0]);
  });
});
