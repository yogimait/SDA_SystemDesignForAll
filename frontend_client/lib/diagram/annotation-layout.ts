/**
 * Narrative annotation chip layout (Annotate toggle): pure geometry so the
 * LLD/HLD canvases can place chips without stacking them on each other, on
 * nodes, or outside the scene. Chips stay anchored to their element — a
 * displaced chip draws a leader line back to its anchor.
 */
import { wrapLabel } from "./label-wrap";

export type AnnotationAnchor = { x: number; y: number };

export type AnnotationChipInput = {
  id: string;
  text: string;
  anchor: AnnotationAnchor;
};

/** Back-compat name used by the canvases and workspace flow. */
export type AnnotationChip = AnnotationChipInput;

export type AnnotationBox = { x: number; y: number; width: number; height: number };

export type LaidOutAnnotationChip = {
  id: string;
  text: string;
  lines: string[];
  anchor: AnnotationAnchor;
  box: AnnotationBox;
  /** True when stacking/clamping moved the chip off its anchor-relative slot. */
  displaced: boolean;
};

/** Dense diagrams get illegible if every element carries a card. */
export const MAX_ANNOTATION_CHIPS = 6;

const LINE_H = 11;
const PAD_X = 8;
const PAD_Y = 5;
const CHAR_W = 5.4; // 10px mono approximation
const GAP = 4; // minimum space between chips
const MARGIN = 6; // keep cards inside the scene
const ANCHOR_GAP = 6; // space between a chip and the element it describes
const MAX_STEPS = 8; // stacking attempts before the chip is dropped

export function annotationChipSize(text: string): {
  lines: string[];
  width: number;
  height: number;
} {
  const lines = wrapLabel(text, 24, 2);
  const width = Math.max(...lines.map((line) => line.length)) * CHAR_W + PAD_X * 2;
  const height = lines.length * LINE_H + PAD_Y * 2;
  return { lines, width, height };
}

function overlaps(a: AnnotationBox, b: AnnotationBox): boolean {
  return (
    a.x < b.x + b.width + GAP &&
    a.x + a.width + GAP > b.x &&
    a.y < b.y + b.height + GAP &&
    a.y + a.height + GAP > b.y
  );
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Places up to `max` chips in input order (first chips win the space).
 * Candidate slots walk up from the anchor, then down, then keep stepping up.
 * A chip with no free slot is dropped rather than covering a node.
 */
export function layoutAnnotationChips(
  chips: AnnotationChipInput[],
  scene: { width: number; height: number },
  options: { obstacles?: AnnotationBox[]; max?: number } = {},
): LaidOutAnnotationChip[] {
  const obstacles = options.obstacles ?? [];
  const max = options.max ?? MAX_ANNOTATION_CHIPS;
  const placed: LaidOutAnnotationChip[] = [];

  for (const chip of chips.slice(0, max)) {
    const { lines, width, height } = annotationChipSize(chip.text);
    const x = clamp(chip.anchor.x - width, MARGIN, scene.width - width - MARGIN);
    const baseY = chip.anchor.y - height - ANCHOR_GAP;

    let box: AnnotationBox | null = null;
    for (let step = 0; step <= MAX_STEPS && box === null; step += 1) {
      const candidates = step === 0 ? [baseY] : [baseY - step * (height + GAP), baseY + step * (height + GAP)];
      for (const candidateY of candidates) {
        const y = clamp(candidateY, MARGIN, scene.height - height - MARGIN);
        const candidate = { x, y, width, height };
        const blocked =
          placed.some((entry) => overlaps(entry.box, candidate)) ||
          obstacles.some((obstacle) => overlaps(obstacle, candidate));
        if (!blocked) {
          box = candidate;
          break;
        }
      }
    }
    if (box === null) continue; // no room without covering something

    placed.push({
      id: chip.id,
      text: chip.text,
      lines,
      anchor: chip.anchor,
      box,
      displaced: box.y !== baseY,
    });
  }

  return placed;
}
