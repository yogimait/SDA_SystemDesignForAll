/**
 * DSA view formatting (F4): every string rendered in the cards/table traces to
 * a contract field — no client-side invention. Grouping preserves the model's
 * own order (deterministic without sorting side effects).
 */
import type { Complexity, DsaLayer, DsaRecommendation } from "@sda/contracts";

/** Chip strings with explicit average/worst wording (planner wording rule). */
export function complexityChips(complexity: Complexity): { average: string; worst: string } {
  return { average: `avg ${complexity.average}`, worst: `worst ${complexity.worst}` };
}

/** Layer badge text. The contract defines lld / hld / shared (not the planner's older wording). */
const LAYER_LABEL: Record<DsaLayer, string> = {
  lld: "LLD layer",
  hld: "HLD layer",
  shared: "Shared LLD + HLD",
};

export function layerLabel(layer: DsaLayer): string {
  return LAYER_LABEL[layer];
}

/** Comparison-table trade-off column: first limitation, placeholder if none. */
export function tradeOffText(recommendation: DsaRecommendation): string {
  return recommendation.limitations[0] ?? "—";
}

export type OperationGroup = { operation: string; items: DsaRecommendation[] };

/** Group recommendations by operation string, keeping first-appearance order. */
export function groupByOperation(recommendations: DsaRecommendation[]): OperationGroup[] {
  const groups: OperationGroup[] = [];
  const byOperation = new Map<string, OperationGroup>();
  for (const recommendation of recommendations) {
    const existing = byOperation.get(recommendation.operation);
    if (existing === undefined) {
      const group: OperationGroup = { operation: recommendation.operation, items: [recommendation] };
      byOperation.set(recommendation.operation, group);
      groups.push(group);
    } else {
      existing.items.push(recommendation);
    }
  }
  return groups;
}
