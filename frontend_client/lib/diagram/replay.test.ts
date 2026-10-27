import { describe, expect, it } from "vitest";
import { pointAt, stepBudgetMs, traversedPath, type PathPoint } from "./replay";

const LINE: PathPoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const BEND: PathPoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

describe("pointAt", () => {
  it("interpolates a straight line monotonically", () => {
    expect(pointAt(LINE, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(LINE, 0.5)).toEqual({ x: 50, y: 0 });
    expect(pointAt(LINE, 1)).toEqual({ x: 100, y: 0 });
  });

  it("interpolates a bent path along total length", () => {
    // total length = 150 → t=0.5 at length 75: base (75,0).
    expect(pointAt(BEND, 0.5)).toEqual({ x: 75, y: 0 });
    expect(pointAt(BEND, 1)).toEqual({ x: 100, y: 50 });
  });

  it("clamps out-of-range fractions and tolerates degenerate input", () => {
    expect(pointAt(LINE, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAt(LINE, 5)).toEqual({ x: 100, y: 0 });
    expect(pointAt([{ x: 3, y: 4 }], 0.4)).toEqual({ x: 3, y: 4 });
    expect(pointAt([], 0.4)).toEqual({ x: 0, y: 0 });
  });
});

describe("traversedPath", () => {
  it("returns only the traversed fraction", () => {
    expect(traversedPath(LINE, 0.5)).toBe("M0.0,0.0 L50.0,0.0");
    expect(traversedPath(LINE, 1).includes("L100.0,0.0")).toBe(true);
    expect(traversedPath(LINE, 0)).toBe("M0.0,0.0");
  });

  it("stops at the interpolated point on a bend", () => {
    const d = traversedPath(BEND, 0.5);
    expect(d).toBe("M0.0,0.0 L75.0,0.0");
  });
});

describe("stepBudgetMs", () => {
  it("scales with speed", () => {
    expect(stepBudgetMs(1)).toBe(1200);
    expect(stepBudgetMs(2)).toBe(600);
  });
});
