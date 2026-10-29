"use client";

/**
 * Narrative annotation chips (2026-10-26): small inline-SVG cards anchored to
 * highlighted elements when the "Annotate" header toggle is on. Decorative
 * duplicates of the accessible labels (aria-hidden), but pointer users can
 * click one to open the existing details popover — chips shortcut to detail,
 * they never replace it.
 *
 * Placement comes from `layoutAnnotationChips`: chips never overlap each
 * other or the diagram nodes, stay inside the scene, and a chip moved off its
 * anchor-relative slot draws a leader line back to the anchor.
 */

import type { AnnotationChip } from "@/lib/diagram/annotation-layout";
import {
  layoutAnnotationChips,
  type AnnotationBox,
} from "@/lib/diagram/annotation-layout";

export type { AnnotationChip };

const LINE_H = 11;
const PAD_X = 8;
const PAD_Y = 5;

export function AnnotationChips({
  chips,
  scene,
  obstacles,
  onSelect,
}: {
  chips: AnnotationChip[];
  /** Scene bounds, so a chip can never be clipped by the SVG edge. */
  scene: { width: number; height: number };
  /** Node rectangles the chips must not cover. */
  obstacles?: AnnotationBox[];
  onSelect: (id: string) => void;
}) {
  const placed = layoutAnnotationChips(chips, scene, { obstacles });
  return (
    <g aria-hidden="true">
      {placed.map((chip) => {
        const { box } = chip;
        // Leader from the chip's bottom edge (nearest the anchor) back to it.
        const leaderX = Math.max(box.x + 4, Math.min(chip.anchor.x, box.x + box.width - 4));
        return (
          <g key={chip.id} className="animate-fade-up motion-reduce:animate-none">
            {chip.displaced ? (
              <line
                x1={leaderX}
                y1={box.y + box.height}
                x2={chip.anchor.x}
                y2={chip.anchor.y}
                className="stroke-primary/50 pointer-events-none"
                strokeWidth={1}
              />
            ) : null}
            <g
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(chip.id);
              }}
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={6}
                data-annotation-chip={chip.id}
                className="fill-card/95 stroke-primary/60 pointer-events-auto"
                strokeWidth={1}
              />
              {chip.lines.map((line, index) => (
                <text
                  key={index}
                  x={box.x + PAD_X}
                  y={box.y + PAD_Y + 8.5 + index * LINE_H}
                  className="fill-foreground/85 pointer-events-none font-mono text-[10px]"
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
    </g>
  );
}
