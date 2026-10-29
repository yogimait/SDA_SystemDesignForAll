import { describe, expect, it } from "vitest";
import {
  MAX_ANNOTATION_CHIPS,
  annotationChipSize,
  layoutAnnotationChips,
  type AnnotationChipInput,
} from "./annotation-layout";

const SCENE = { width: 900, height: 640 };

const chip = (id: string, x: number, y: number, text = "short note"): AnnotationChipInput => ({
  id,
  text,
  anchor: { x, y },
});

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("annotation chip layout", () => {
  it("keeps a lone chip inside the scene and above its anchor", () => {
    const [placed] = layoutAnnotationChips([chip("a", 400, 300)], SCENE);
    expect(placed).toBeDefined();
    expect(placed.box.y + placed.box.height).toBeLessThanOrEqual(300);
    expect(placed.box.x).toBeGreaterThanOrEqual(0);
    expect(placed.box.x + placed.box.width).toBeLessThanOrEqual(SCENE.width);
    expect(placed.displaced).toBe(false);
  });

  it("clamps an anchor at the scene edge", () => {
    const [placed] = layoutAnnotationChips([chip("a", 2, 4)], SCENE);
    expect(placed).toBeDefined();
    expect(placed.box.x).toBeGreaterThanOrEqual(0);
    expect(placed.box.y).toBeGreaterThanOrEqual(0);
    expect(placed.displaced).toBe(true);
  });

  it("stacks chips sharing an anchor instead of overlapping", () => {
    const chips = [
      chip("a", 400, 300, "first annotation"),
      chip("b", 400, 300, "second annotation"),
      chip("c", 400, 300, "third annotation"),
    ];
    const placed = layoutAnnotationChips(chips, SCENE);
    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(intersects(placed[i].box, placed[j].box)).toBe(false);
      }
    }
    expect(placed.filter((entry) => entry.displaced)).toHaveLength(2);
  });

  it("never covers a node rectangle", () => {
    const obstacle = { x: 250, y: 120, width: 300, height: 200 };
    const placed = layoutAnnotationChips(
      [chip("a", 400, 220), chip("b", 410, 230)],
      SCENE,
      { obstacles: [obstacle] },
    );
    expect(placed.length).toBeGreaterThan(0);
    for (const entry of placed) {
      expect(intersects(entry.box, obstacle)).toBe(false);
    }
  });

  it("drops chips that have no free slot and caps the count", () => {
    const blocked = { x: 0, y: 0, width: SCENE.width, height: SCENE.height };
    expect(layoutAnnotationChips([chip("a", 100, 100)], SCENE, { obstacles: [blocked] })).toEqual([]);

    const many = Array.from({ length: MAX_ANNOTATION_CHIPS + 4 }, (_, index) =>
      chip(`c${index}`, 200 + index * 60, 300),
    );
    expect(layoutAnnotationChips(many, SCENE)).toHaveLength(MAX_ANNOTATION_CHIPS);
  });

  it("sizes a card from its wrapped text", () => {
    const short = annotationChipSize("abc");
    const long = annotationChipSize("a much longer annotation that must wrap onto a second line");
    expect(short.lines).toHaveLength(1);
    expect(short.width).toBeLessThan(long.width);
    expect(long.height).toBeGreaterThan(short.height);
  });
});
