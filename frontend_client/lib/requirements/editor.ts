/**
 * Pure requirements-editor list operations. The server owns real ids
 * (`fr_…`, `nfr_…`, contracts source of truth); locally added rows carry
 * `local-*` keys and submit WITHOUT an id so the server assigns one. Local
 * keys only exist for React reconciliation and never reach the wire.
 */
import type {
  NonFunctionalCategory,
  RequirementPriority,
  RequirementsSpec,
} from "@sda/contracts";

export type FunctionalRow = {
  key: string;
  /** Server-assigned id; undefined for rows the user just added. */
  id?: string;
  text: string;
  priority: RequirementPriority;
};

export type NonFunctionalRow = FunctionalRow & {
  category: NonFunctionalCategory;
  /** Empty string = no measurable target yet. */
  target: string;
};

const LOCAL_KEY_PATTERN = /^local-(\d+)$/;

/** Stable unique client key: `local-<n>` with n above every existing number. */
export function nextLocalKey(rows: ReadonlyArray<{ key: string }>): string {
  let max = 0;
  for (const row of rows) {
    const match = LOCAL_KEY_PATTERN.exec(row.key);
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `local-${(max + 1).toString(10)}`;
}

export function addFunctionalRow(rows: FunctionalRow[]): FunctionalRow[] {
  return [
    ...rows,
    { key: nextLocalKey(rows), text: "", priority: "must" as const },
  ];
}

export function addNonFunctionalRow(rows: NonFunctionalRow[]): NonFunctionalRow[] {
  return [
    ...rows,
    {
      key: nextLocalKey(rows),
      text: "",
      priority: "must" as const,
      category: "performance" as const,
      target: "",
    },
  ];
}

export function updateRow<R extends { key: string }>(
  rows: R[],
  key: string,
  patch: Partial<Omit<R, "key" | "id">>,
): R[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

export function removeRow(rows: readonly { key: string }[], key: string) {
  return (rows as Array<{ key: string }>).filter((row) => row.key !== key);
}

/** One position up or down (`direction` −1/+1); no-op at the border. */
export function moveRow<R>(rows: R[], key: string, direction: -1 | 1): R[] {
  const index = rows.findIndex((row) => (row as { key: string }).key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return rows;
  const copy = rows.slice(0);
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function hasEmptyText(rows: ReadonlyArray<{ text: string }>): boolean {
  return rows.some((row) => row.text.trim().length === 0);
}

/** Existing ids are preserved on reorder (checkpoint: ID stability). */
export function functionalPayload(
  rows: ReadonlyArray<FunctionalRow>,
): Array<{ id?: string; text: string; priority: RequirementPriority }> {
  return rows.map((row) => ({
    ...(row.id === undefined ? {} : { id: row.id }),
    text: row.text.trim(),
    priority: row.priority,
  }));
}

export function nonFunctionalPayload(
  rows: ReadonlyArray<NonFunctionalRow>,
): Array<{
  id?: string;
  text: string;
  priority: RequirementPriority;
  category: NonFunctionalCategory;
  target: string;
}> {
  return rows.map((row) => ({
    ...(row.id === undefined ? {} : { id: row.id }),
    text: row.text.trim(),
    priority: row.priority,
    category: row.category,
    target: row.target,
  }));
}

/** Map a received spec onto editor rows (server ids become row keys). */
export function rowsFromSpec(spec: RequirementsSpec): {
  functional: FunctionalRow[];
  nonFunctional: NonFunctionalRow[];
} {
  return {
    functional: spec.functional.map((item) => ({
      key: item.id,
      id: item.id,
      text: item.text,
      priority: item.priority,
    })),
    nonFunctional: spec.nonFunctional.map((item) => ({
      key: item.id,
      id: item.id,
      text: item.text,
      priority: item.priority,
      category: item.category,
      target: item.target ?? "",
    })),
  };
}
