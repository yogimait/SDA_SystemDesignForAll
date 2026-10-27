/**
 * Pure replay math for the HLD flow path replay: points along a dagre
 * polyline, and the monotonically increasing interpolated position of the
 * traveling dot. Pure and deterministic (tested); the rAF loop lives in the
 * ReplayLayer presentational component.
 */
export type PathPoint = { x: number; y: number };

export const TRAVEL_MS = 800;
export const PAUSE_MS = 400;

/** Total engine budget for one step (travel + pause), scaled by speed. Rarely
 * needed directly — ReplayLayer measures elapsed against 1200/speed. */
export function stepBudgetMs(speed: number): number {
  return (TRAVEL_MS + PAUSE_MS) / speed;
}

function segmentLengths(points: PathPoint[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return lengths;
}

/** Position at fraction `t` (0..1) of total polyline length, clamped. */
export function pointAt(points: PathPoint[], t: number): PathPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths = segmentLengths(points);
  const total = lengths[lengths.length - 1];
  if (total <= 0) return points[points.length - 1];
  const target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i += 1) {
    if (lengths[i] >= target) {
      const a = points[i - 1];
      const b = points[i];
      const seg = lengths[i] - lengths[i - 1];
      const f = seg > 0 ? (target - lengths[i - 1]) / seg : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return points[points.length - 1];
}

/** Traversed part of the polyline (for the dot's trailing stroke). */
export function traversedPath(points: PathPoint[], t: number): string {
  if (points.length < 2) return "";
  const lengths = segmentLengths(points);
  const total = lengths[lengths.length - 1];
  if (total <= 0) return "";
  const target = Math.min(1, Math.max(0, t)) * total;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    if (lengths[i] <= target) {
      d += ` L${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`;
      continue;
    }
    const a = points[i - 1];
    const b = points[i];
    const seg = lengths[i] - lengths[i - 1];
    const f = seg > 0 ? (target - lengths[i - 1]) / seg : 0;
    if (f > 0) {
      d += ` L${(a.x + (b.x - a.x) * f).toFixed(1)},${(a.y + (b.y - a.y) * f).toFixed(1)}`;
    }
    break;
  }
  return d;
}
