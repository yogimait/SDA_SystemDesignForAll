"use client";

/**
 * Compact sequence diagram for the printable export: participant header
 * boxes, dashed lifelines, labelled arrows with step badges, self-message
 * loops. Static SVG (no pan/zoom, no new dependency): native width/height
 * attributes give print an intrinsic size to scale DOWN from (`max-height:
 * 170mm`), while screen CSS scales it up to the 640px text column — so
 * nothing overflows narrow pages and long flows never grow past a page.
 * The beforeprint refit used by the live canvases does not apply here.
 * Export-only: the workspace renders the architecture model, not flows.
 */
import { useId } from "react";
import { cn } from "cn";
import { HLD_EDGE_DASH } from "@/lib/diagram/hld-scene";
import {
  SEQ_HEADER_H,
  SEQ_PAD_X,
  SEQ_ROW_H,
  truncateSequenceLabel,
  type SequenceMessage,
  type SequenceParticipant,
  type SequenceScene,
} from "@/lib/diagram/sequence-scene";

/** Header box height inside the SEQ_HEADER_H band. */
const BOX_H = 30;
const SELF_LOOP_W = 34;
const SELF_LOOP_H = 16;
/** Approximate px per character for the 10px label / 11px name text. */
const LABEL_CHAR_PX = 6.4;
const NAME_CHAR_PX = 6.6;

export function SequenceCanvas({
  scene,
  flowName,
  className,
}: {
  scene: SequenceScene;
  flowName: string;
  className?: string;
}) {
  const markerId = `seq-arrow-${useId().replace(/:/g, "")}`;
  const participantById = new Map(scene.participants.map((participant) => [participant.id, participant]));
  const lifeBottom = Math.max(BOX_H, scene.height - 4);

  return (
    <svg
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      width={scene.width}
      height={scene.height}
      className={cn("block h-auto w-full", className)}
      role="img"
      aria-label={`Sequence diagram for ${flowName}: ${scene.participants.length} participant${scene.participants.length === 1 ? "" : "s"}, ${scene.messages.length} step${scene.messages.length === 1 ? "" : "s"}.`}
    >
      <title>{`${flowName} — sequence diagram`}</title>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M1,1 L9,5 L1,9"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      {/* Lifelines run below the header boxes to the scene floor. */}
      {scene.participants.map((participant) => (
        <line
          key={`life-${participant.id}`}
          x1={participant.x}
          y1={BOX_H}
          x2={participant.x}
          y2={lifeBottom}
          className="stroke-muted-foreground/45"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}

      {scene.participants.map((participant) => (
        <g key={participant.id} className="seq-participant">
          <title>{participant.name}</title>
          <rect
            x={participant.x - participant.width / 2}
            y={0}
            width={participant.width}
            height={BOX_H}
            rx={8}
            className="fill-card stroke-border"
            strokeWidth={1.2}
          />
          <text
            x={participant.x}
            y={19.5}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-semibold"
          >
            {truncateSequenceLabel(participant.name, (participant.width - 14) / NAME_CHAR_PX)}
          </text>
        </g>
      ))}

      {scene.messages.map((message, index) => (
        <SequenceArrow
          key={`${message.stepOrder}-${index}`}
          message={message}
          scene={scene}
          markerId={markerId}
          participantById={participantById}
          row={index}
        />
      ))}
    </svg>
  );
}

function SequenceArrow({
  message,
  scene,
  markerId,
  participantById,
  row,
}: {
  message: SequenceMessage;
  scene: SequenceScene;
  markerId: string;
  participantById: Map<string, SequenceParticipant>;
  row: number;
}) {
  const from = participantById.get(message.from);
  const to = participantById.get(message.to);
  if (from === undefined || to === undefined) return null;

  const y = SEQ_HEADER_H + row * SEQ_ROW_H + SEQ_ROW_H / 2;
  const stepBadge = (
    <g className="seq-step-badge">
      <circle cx={0} cy={0} r={7} className="fill-primary" />
      <text
        y={3.3}
        textAnchor="middle"
        className="fill-primary-foreground text-[9.5px] font-semibold"
      >
        {message.stepOrder}
      </text>
    </g>
  );
  const title = (
    <title>{`Step ${message.stepOrder}: ${from.name} to ${to.name} — ${message.label}`}</title>
  );
  const dash = message.kind !== undefined ? HLD_EDGE_DASH[message.kind] : undefined;

  // Self-message: loop off the lifeline (to the free side), label beside it.
  if (message.from === message.to) {
    const rightSide = from.x + 8 + SELF_LOOP_W + 8 + 80 <= scene.width - SEQ_PAD_X;
    const dir = rightSide ? 1 : -1;
    const loopStart = from.x + dir * 8;
    const loopEnd = from.x + dir * (8 + SELF_LOOP_W);
    const yTop = y - SELF_LOOP_H / 2;
    const labelX = rightSide ? loopEnd + 8 : loopEnd - 8;
    const labelBudget = rightSide
      ? scene.width - SEQ_PAD_X - labelX
      : labelX - SEQ_PAD_X;
    return (
      <g>
        {title}
        <path
          d={`M ${loopStart},${yTop} H ${loopEnd} V ${yTop + SELF_LOOP_H} H ${from.x}`}
          className="fill-none stroke-foreground/55"
          strokeWidth={1.4}
          strokeDasharray={dash}
          markerEnd={`url(#${markerId})`}
        />
        <g transform={`translate(${from.x}, ${yTop})`}>{stepBadge}</g>
        <text
          x={labelX}
          y={yTop + SELF_LOOP_H / 2 + 3.5}
          textAnchor={rightSide ? "start" : "end"}
          className="fill-foreground text-[10px]"
          stroke="var(--card)"
          paintOrder="stroke"
          strokeWidth={3.5}
        >
          {truncateSequenceLabel(message.label, labelBudget / LABEL_CHAR_PX)}
        </text>
      </g>
    );
  }

  // Regular message: lifeline → lifeline arrow, badge on the line at the
  // midpoint, label directly above it (clamped to the arrow's span).
  const midX = (from.x + to.x) / 2;
  const span = Math.abs(to.x - from.x);
  return (
    <g>
      {title}
      <line
        x1={from.x}
        y1={y}
        x2={to.x}
        y2={y}
        className="stroke-foreground/55"
        strokeWidth={1.4}
        strokeDasharray={dash}
        markerEnd={`url(#${markerId})`}
      />
      <text
        x={midX}
        y={y - 10}
        textAnchor="middle"
        className="fill-foreground text-[10px]"
        stroke="var(--card)"
        paintOrder="stroke"
        strokeWidth={3.5}
      >
        {truncateSequenceLabel(message.label, span / LABEL_CHAR_PX)}
      </text>
      <g transform={`translate(${midX}, ${y})`}>{stepBadge}</g>
    </g>
  );
}
