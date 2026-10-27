import { describe, expect, it } from "vitest";
import { wrapLabel } from "./label-wrap";

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("submits idea", 24, 2)).toEqual(["submits idea"]);
  });

  it("wraps at word boundaries within the line budget", () => {
    const lines = wrapLabel("SQL queries · PostgreSQL protocol", 16, 2);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(16);
    expect(lines[0]).toBe("SQL queries ·");
    // 33 chars do not fit two 16-char lines — the rest truncates with an
    // ellipsis (the full text lives in the details panel / aria-labels).
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("truncates the last line with an ellipsis when the budget is exhausted", () => {
    const lines = wrapLabel("Pub/Sub mediated by message queue · Idempotent Receiver", 12, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Pub/Sub");
    expect(lines[1].endsWith("…")).toBe(true);
    expect(lines[1].length).toBeLessThanOrEqual(12);
  });

  it("passes through a single long word untouched", () => {
    expect(wrapLabel("aVeryVeryVeryLongIdentifierWithoutSpaces", 12, 2)).toEqual([
      "aVeryVeryVeryLongIdentifierWithoutSpaces",
    ]);
  });

  it("handles empty text", () => {
    expect(wrapLabel("", 24, 2)).toEqual([""]);
  });
});
