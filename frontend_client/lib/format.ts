import type { RequirementsSpec } from "@sda/contracts";

/** Small shared formatters (kept side-effect free and unit-testable). */
export function formatTokens(amount: number): string {
  return amount.toLocaleString("en-US");
}

/** ISO timestamp → local display string; null for missing/invalid values. */
export function formatTimestamp(value: string | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Human labels for requirement refs. Contract ids (`fr_…`, `nfr_…`, `q_…`,
 * `asm_…`) are UI keys only — the workspace details and DSA cards show the
 * numbered row a reader can find in the requirements editor instead.
 */
export function requirementRefLabels(spec: RequirementsSpec): Map<string, string> {
  const labels = new Map<string, string>();
  spec.functional.forEach((item, index) => labels.set(item.id, `FR ${index + 1}`));
  spec.nonFunctional.forEach((item, index) => labels.set(item.id, `NFR ${index + 1}`));
  spec.clarifications.forEach((item, index) => labels.set(item.id, `Q ${index + 1}`));
  spec.assumptions.forEach((item, index) => labels.set(item.id, `A ${index + 1}`));
  return labels;
}
