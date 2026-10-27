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
