import type { HldComponent, LldClass } from "@sda/contracts";

/**
 * Cross-view learning link: the contract carries no direct component↔class
 * reference, so shared requirement refs are the only honest bridge between
 * the HLD and LLD views. Never infer links by name.
 */
export function relatedByRefs<T extends { requirementRefs: readonly string[] }>(
  refs: readonly string[],
  items: readonly T[],
): T[] {
  if (refs.length === 0) return [];
  const wanted = new Set(refs);
  return items.filter((item) =>
    item.requirementRefs.some((ref) => wanted.has(ref)),
  );
}

/** LLD classes implementing (sharing a requirement with) an HLD component. */
export function relatedLldClasses(
  component: Pick<HldComponent, "requirementRefs">,
  classes: readonly LldClass[],
): LldClass[] {
  return relatedByRefs(component.requirementRefs, classes);
}

/** HLD components a class contributes to (mirrors `relatedLldClasses`). */
export function relatedHldComponents(
  lldClass: Pick<LldClass, "requirementRefs">,
  components: readonly HldComponent[],
): HldComponent[] {
  return relatedByRefs(lldClass.requirementRefs, components);
}
