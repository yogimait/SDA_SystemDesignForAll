/**
 * Export-only diagram orientation. The printable diagram box is landscape A4
 * content (width/height ≈ 1.5), while the workspace scenes use fixed rank
 * directions (LLD `BT`, HLD `LR`). For paper the export builds both candidate
 * orientations and keeps the one whose scene aspect is closest to the box, so
 * fit-to-page scaling leaves the least whitespace. The workspace never calls
 * these helpers — its layout and tests stay untouched.
 */
import type { HldModel, LldModel } from "@sda/contracts";
// Relative import: vitest has no `@/` alias (see vitest.config.ts).
import {
  buildHldScene,
  type HldRankdir,
  type HldScene,
} from "../diagram/hld-scene";
import {
  buildLldScene,
  type LldRankdir,
  type LldScene,
} from "../diagram/lld-scene";

/** Width/height of the printable diagram box: landscape A4 content ≈ 1.5. */
export const EXPORT_DIAGRAM_ASPECT = 1.5;

type SceneCandidate<TRankdir> = {
  rankdir: TRankdir;
  scene: { width: number; height: number };
};

/**
 * Pick the candidate whose scene aspect is closest to `target`. Ties keep the
 * first candidate, so candidates must list the workspace default orientation
 * first — an identical aspect never changes the orientation users see.
 */
export function pickByAspect<T extends SceneCandidate<unknown>>(
  candidates: readonly [T, ...T[]],
  target: number,
): T {
  let best = candidates[0];
  let bestDelta = Math.abs(best.scene.width / best.scene.height - target);
  for (const candidate of candidates.slice(1)) {
    const delta = Math.abs(candidate.scene.width / candidate.scene.height - target);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

export function buildExportHldScene(hld: HldModel): {
  scene: HldScene;
  rankdir: HldRankdir;
} {
  return pickByAspect(
    [
      { rankdir: "LR" as const, scene: buildHldScene(hld, { rankdir: "LR" }) },
      { rankdir: "TB" as const, scene: buildHldScene(hld, { rankdir: "TB" }) },
    ],
    EXPORT_DIAGRAM_ASPECT,
  );
}

export function buildExportLldScene(
  model: LldModel,
  options?: { patternNamesByClassId?: Map<string, string[]> },
): {
  scene: LldScene;
  rankdir: LldRankdir;
} {
  return pickByAspect(
    [
      {
        rankdir: "BT" as const,
        scene: buildLldScene(model, { ...options, rankdir: "BT" }),
      },
      {
        rankdir: "LR" as const,
        scene: buildLldScene(model, { ...options, rankdir: "LR" }),
      },
    ],
    EXPORT_DIAGRAM_ASPECT,
  );
}
