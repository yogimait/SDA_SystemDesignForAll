import { describe, expect, it } from "vitest";
import {
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
