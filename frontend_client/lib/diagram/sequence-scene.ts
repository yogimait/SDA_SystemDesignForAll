/**
 * Sequence scene mapping for the printable export: an HLD flow's ordered
 * steps → participants + messages with deterministic geometry. Pure and
 * React-free — the export document and unit tests share this module.
 * References resolve against the model only: unknown refs are dropped,
 * never invented, so a step that resolves to nothing is skipped.
 */
import type { ConnectionKind, HldConnection, HldFlow, HldModel } from "@sda/contracts";

export type SequenceParticipant = {
  id: string;
  name: string;
  /** Lifeline centre x in scene coordinates; the header box is centred on it. */
  x: number;
  /** Header box width (the name truncates to it). */
  width: number;
};

export type SequenceMessage = {
  /** The contract step `order`, rendered as the badge. */
  stepOrder: number;
  from: string;
  to: string;
  /** Full step description; the canvas truncates it to the arrow span. */
  label: string;
  /** Present when the step resolved through a connection ref. */
  kind?: ConnectionKind;
};

export type SequenceScene = {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
  /** 0×0 when nothing resolves (the export hides such flows). */
  width: number;
  height: number;
};

export const SEQ_MIN_WIDTH = 320;
/** Header band (the box is 30 of it) + one row per message + bottom room. */
export const SEQ_HEADER_H = 44;
export const SEQ_ROW_H = 40;
export const SEQ_BOTTOM = 12;
export const SEQ_PAD_X = 16;
const SEQ_BOX_MIN = 72;
const SEQ_BOX_MAX = 150;

/** Ellipsis-truncate to a character budget (never below 4 characters). */
export function truncateSequenceLabel(label: string, maxChars: number): string {
  const budget = Math.max(4, Math.floor(maxChars));
  return label.length <= budget ? label : `${label.slice(0, budget - 1)}…`;
}

/**
 * One compact, deterministic sequence scene per flow.
 *
 * Mapping rules (in step order, steps sorted by their contract `order`):
 * - a resolvable connection ref names both endpoints (and contributes its
 *   kind); otherwise the step's first two component refs are the endpoints;
 * - a single component ref is a self-message;
 * - a step whose refs resolve to no component is skipped (never invented).
 * Participants are the components actually used by the messages, ordered by
 * first appearance across the flow's steps.
 */
export function buildSequenceScene(model: HldModel, flow: HldFlow): SequenceScene {
  const componentById = new Map(model.components.map((component) => [component.id, component]));
  const connectionById = new Map(model.connections.map((connection) => [connection.id, connection]));

  const steps = [...flow.steps].sort((a, b) => a.order - b.order);
  const messages: SequenceMessage[] = [];
  const ordered: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();

  for (const step of steps) {
    let connectionRef: HldConnection | undefined;
    const componentRefs: string[] = [];
    for (const ref of step.elementRefs) {
      const connection = connectionById.get(ref);
      if (
        connectionRef === undefined &&
        connection !== undefined &&
        componentById.has(connection.fromComponentId) &&
        componentById.has(connection.toComponentId)
      ) {
        connectionRef = connection;
        continue;
      }
      if (componentById.has(ref)) componentRefs.push(ref);
    }

    let from: string;
    let to: string;
    let kind: ConnectionKind | undefined;
    if (connectionRef !== undefined) {
      from = connectionRef.fromComponentId;
      to = connectionRef.toComponentId;
      kind = connectionRef.kind;
    } else if (componentRefs.length >= 2) {
      from = componentRefs[0];
      to = componentRefs[1];
    } else if (componentRefs.length === 1) {
      from = componentRefs[0];
      to = componentRefs[0];
    } else {
      continue; // nothing resolvable — skip the step instead of inventing a component
    }

    for (const id of [from, to]) {
      if (seen.has(id)) continue;
      const component = componentById.get(id);
      if (component === undefined) continue; // unreachable: endpoints were checked above
      seen.add(id);
      ordered.push({ id: component.id, name: component.name });
    }

    const message: SequenceMessage = {
      stepOrder: step.order,
      from,
      to,
      label: step.description,
    };
    if (kind !== undefined) message.kind = kind;
    messages.push(message);
  }

  if (messages.length === 0) {
    return { participants: [], messages: [], width: 0, height: 0 };
  }

  // Width grows with the participant count and is only capped by CSS on
  // screen/print: the box floor is 72px, so capping the scene itself made
  // ≥10 participants overlap their neighbours.
  const count = ordered.length;
  const width = Math.max(SEQ_MIN_WIDTH, 160 + count * 110);
  const inner = width - SEQ_PAD_X * 2;
  const boxWidth = Math.min(
    SEQ_BOX_MAX,
    Math.max(SEQ_BOX_MIN, Math.floor(inner / count - 16)),
  );
  const participants: SequenceParticipant[] = ordered.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    x: Math.round(SEQ_PAD_X + (inner * (index + 0.5)) / count),
    width: boxWidth,
  }));

  return {
    participants,
    messages,
    width,
    height: SEQ_HEADER_H + messages.length * SEQ_ROW_H + SEQ_BOTTOM,
  };
}
