"use client";

/**
 * Narrative annotation chips (2026-10-26): small inline-SVG cards anchored to
 * highlighted elements when the "Annotate" header toggle is on. Decorative
 * duplicates of the accessible labels (aria-hidden), but pointer users can
 * click one to open the existing details popover — chips shortcut to detail,
 * they never replace it.
 */

import { wrapLabel } from "@/lib/diagram/label-wrap";

export type AnnotationChip = {
  id: string;
  text: string;
  /** Right edge of the anchor element (node chips) or midpoint above the
   * line (edge chips), in scene coordinates. */
  anchor: { x: number; y: number };
};

const LINE_H = 11;
const PAD_X = 8;
const PAD_Y = 5;
const CHAR_W = 5.4; // 10px mono approximation

export function AnnotationChips({
  chips,
  onSelect,
}: {
  chips: AnnotationChip[];
  onSelect: (id: string) => void;
}) {
  return (
    <g aria-hidden="true">
      {chips.map((chip) => {
        const lines = wrapLabel(chip.text, 24, 2);
        const width =
          Math.max(...lines.map((line) => line.length)) * CHAR_W + PAD_X * 2;
        const height = lines.length * LINE_H + PAD_Y * 2;
        return (
          <g
            key={chip.id}
            className="animate-fade-up cursor-pointer motion-reduce:animate-none"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(chip.id);
            }}
          >
            <rect
              x={chip.anchor.x - width}
              y={chip.anchor.y - height - 6}
              width={width}
              height={height}
              rx={6}
              className="fill-card/95 stroke-primary/60 pointer-events-auto"
              strokeWidth={1}
            />
            {lines.map((line, i) => (
              <text
                key={i}
                x={chip.anchor.x - PAD_X}
                y={chip.anchor.y - height - 6 + PAD_Y + 8.5 + i * LINE_H}
                textAnchor="end"
                className="fill-foreground/85 pointer-events-none font-mono text-[10px]"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}
