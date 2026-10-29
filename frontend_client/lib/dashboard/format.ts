/**
 * Display formatting for the authenticated dashboard (contract fields only —
 * nothing invented client-side). Pure and unit-tested.
 */
import type { DashboardRange } from "@sda/contracts";

/** Compact token counters: 1234 → "1,234", 1200340 → "1.2M". */
export function formatTokensCompact(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${(Math.round(millions * 10) / 10).toLocaleString("en-US")}M`;
  }
  if (value >= 1_000) {
    return Math.round(value).toLocaleString("en-US");
  }
  return String(value);
}

/**
 * X-axis tick layout for daily buckets: one date label every `step` buckets,
 * anchored at both ends (first + last bucket always labeled), with the last
 * anchor clamped/deduped so ticks span their interval and never collide.
 */
export function bucketTickIndices(bucketCount: number, step: number): number[] {
  if (bucketCount <= 0) return [];
  const normalizedStep = Math.max(1, Math.floor(step));
  const ticks = new Set<number>();
  for (let index = 0; index < bucketCount; index += normalizedStep) {
    ticks.add(index);
  }
  // Always anchor to the right edge so the last tick sits under the newest day.
  ticks.add(bucketCount - 1);
  return [...ticks].sort((a, b) => a - b);
}

const RANGE_LABELS: Record<DashboardRange, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
};

export function rangeLabel(range: DashboardRange): string {
  return RANGE_LABELS[range];
}

/** Run rows sorted newest-first by createdAt (falls back to insertion). */
export function sortRunsNewestFirst<T extends { createdAt: string }>(runs: T[]): T[] {
  return [...runs].sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Bar-width percent for a model usage row relative to the leading model. */
export function usageBarPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((value / max) * 100);
}

/**
 * X-axis tick step for daily buckets: every Nth bucket gets a date label,
 * capped at ~7 labels so they never collide on narrow screens.
 */
const LABEL_STEPS = [1, 2, 5, 10, 15, 30] as const;

export function bucketLabelStep(bucketCount: number): number {
  if (bucketCount <= 0) return 1;
  for (const step of LABEL_STEPS) {
    if (bucketCount / step <= 7) return step;
  }
  return 30;
}
