/**
 * Sequence scene mapping tests: connection refs, component refs, self
 * messages, unknown refs, deterministic first-appearance order, empty flows,
 * and the geometry band. Fixture is handwritten (fixtures belong in tests).
 */
import { describe, expect, it } from "vitest";
import type { HldComponent, HldFlow, HldModel } from "@sda/contracts";
import {
  buildSequenceScene,
  SEQ_HEADER_H,
  SEQ_MIN_WIDTH,
  SEQ_ROW_H,
  SEQ_BOTTOM,
  truncateSequenceLabel,
} from "./sequence-scene";

const model: HldModel = {
  components: [
    {
      id: "cmp_gw",
      name: "Gateway",
      type: "gateway",
      responsibility: "Accepts calls",
      technology: "nginx",
      requirementRefs: [],
      scalingNotes: "",
    },
    {
      id: "cmp_cache",
      name: "Cache",
      type: "cache",
      responsibility: "Stores windows",
      technology: "Redis",
      requirementRefs: [],
      scalingNotes: "",
    },
    {
      id: "cmp_db",
      name: "Postgres",
      type: "store",
      responsibility: "Persists audit rows",
      technology: "Postgres 16",
      requirementRefs: [],
      scalingNotes: "",
    },
  ],
  connections: [
    {
      id: "conn_lookup",
      fromComponentId: "cmp_gw",
      toComponentId: "cmp_cache",
      kind: "sync",
      label: "lookup",
      protocol: "http",
      rationale: "Read-through lookup.",
    },
    {
      id: "conn_audit",
      fromComponentId: "cmp_cache",
      toComponentId: "cmp_db",
      kind: "async",
      label: "audit",
      protocol: "kafka",
      rationale: "Writes are buffered.",
    },
    {
      id: "conn_self",
      fromComponentId: "cmp_cache",
      toComponentId: "cmp_cache",
      kind: "data",
      label: "evict",
      protocol: "",
      rationale: "Self eviction.",
    },
  ],
  flows: [],
  technologyDecisions: [],
  scalabilityNotes: [],
  failureScenarios: [],
};

const flow = (steps: HldFlow["steps"]): HldFlow => ({
  id: "flow_seq",
  name: "Read through",
  description: "Gateway reads the cache.",
  steps,
  requirementRefs: [],
});

const step = (order: number, description: string, elementRefs: string[]) => ({
  order,
  description,
  elementRefs,
});

describe("buildSequenceScene", () => {
  it("maps a connection ref to its from/to endpoints and kind", () => {
    const scene = buildSequenceScene(model, flow([step(1, "lookup window", ["conn_lookup"])]));

    expect(scene.messages).toEqual([
      { stepOrder: 1, from: "cmp_gw", to: "cmp_cache", label: "lookup window", kind: "sync" },
    ]);
    expect(scene.participants.map((p) => p.name)).toEqual(["Gateway", "Cache"]);
  });

  it("prefers a connection ref over component refs in the same step", () => {
    const scene = buildSequenceScene(
      model,
      flow([step(1, "mixed refs", ["cmp_db", "conn_lookup"])]),
    );

    expect(scene.messages[0]).toMatchObject({ from: "cmp_gw", to: "cmp_cache", kind: "sync" });
    expect(scene.participants.map((p) => p.id)).toEqual(["cmp_gw", "cmp_cache"]);
  });

  it("maps two component refs to the first two in order, with no kind", () => {
    const scene = buildSequenceScene(
      model,
      flow([step(1, "two refs", ["cmp_cache", "cmp_db", "cmp_gw"])]),
    );

    expect(scene.messages[0]).toEqual({
      stepOrder: 1,
      from: "cmp_cache",
      to: "cmp_db",
      label: "two refs",
    });
    // The third ref never becomes a participant — only drawn endpoints do.
    expect(scene.participants.map((p) => p.id)).toEqual(["cmp_cache", "cmp_db"]);
  });

  it("maps a single component ref to a self-message", () => {
    const scene = buildSequenceScene(model, flow([step(1, "count window", ["cmp_cache"])]));

    expect(scene.messages[0]).toMatchObject({ from: "cmp_cache", to: "cmp_cache" });
    expect(scene.participants).toHaveLength(1);
  });

  it("keeps the connection kind on a self connection", () => {
    const scene = buildSequenceScene(model, flow([step(1, "evict", ["conn_self"])]));

    expect(scene.messages[0]).toMatchObject({
      from: "cmp_cache",
      to: "cmp_cache",
      kind: "data",
    });
  });

  it("skips unknown refs and returns an empty scene when nothing resolves", () => {
    const skipped = buildSequenceScene(
      model,
      flow([
        step(1, "unknown hop", ["cmp_ghost", "conn_ghost"]),
        step(2, "real hop", ["cmp_gw"]),
      ]),
    );
    expect(skipped.messages).toHaveLength(1);
    expect(skipped.messages[0].stepOrder).toBe(2);

    const empty = buildSequenceScene(model, flow([step(1, "nowhere", ["cmp_ghost"])]));
    expect(empty).toEqual({ participants: [], messages: [], width: 0, height: 0 });
  });

  it("returns an empty scene for a flow with no steps", () => {
    expect(buildSequenceScene(model, flow([]))).toEqual({
      participants: [],
      messages: [],
      width: 0,
      height: 0,
    });
  });

  it("orders participants by first appearance in step order, deterministically", () => {
    const steps = [
      step(2, "audit", ["conn_audit"]),
      step(1, "lookup", ["conn_lookup"]),
      step(3, "self evict", ["cmp_cache"]),
    ];
    const scene = buildSequenceScene(model, flow(steps));
    // Step 1 (Gateway → Cache) registers first, then step 2 adds Postgres.
    expect(scene.participants.map((p) => p.id)).toEqual(["cmp_gw", "cmp_cache", "cmp_db"]);
    expect(scene.messages.map((m) => m.stepOrder)).toEqual([1, 2, 3]);

    // Shuffling the input step array changes nothing (sorted by order).
    const rebuilt = buildSequenceScene(model, flow([...steps].reverse()));
    expect(rebuilt).toEqual(scene);
  });

  it("stays inside the compact geometry band", () => {
    const many = buildSequenceScene(
      model,
      flow([
        step(1, "a", ["cmp_gw"]),
        step(2, "b", ["cmp_cache"]),
        step(3, "c", ["cmp_db"]),
        step(4, "d", ["cmp_gw"]),
        step(5, "e", ["cmp_cache"]),
        step(6, "f", ["cmp_db"]),
      ]),
    );
    expect(many.width).toBeGreaterThanOrEqual(SEQ_MIN_WIDTH);
    expect(many.height).toBe(SEQ_HEADER_H + 6 * SEQ_ROW_H + SEQ_BOTTOM);
    for (const message of many.messages) {
      expect(many.participants.some((p) => p.id === message.from)).toBe(true);
      expect(many.participants.some((p) => p.id === message.to)).toBe(true);
    }
    const xs = many.participants.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(many.width);
  });

  it("keeps adjacent participant boxes non-overlapping at 9 and 10 participants", () => {
    for (const count of [9, 10]) {
      const wide: HldModel = {
        ...model,
        components: Array.from(
          { length: count },
          (_, index): HldComponent => ({
            id: `cmp_${index}`,
            name: `Service ${index}`,
            type: "service",
            responsibility: "Handles requests",
            technology: "",
            requirementRefs: [],
            scalingNotes: "",
          }),
        ),
        connections: [],
      };
      const steps = Array.from({ length: count }, (_, index) =>
        step(index + 1, `step ${index + 1}`, [`cmp_${index}`]),
      );
      const scene = buildSequenceScene(wide, flow(steps));

      expect(scene.participants).toHaveLength(count);
      expect(scene.width).toBe(160 + count * 110);
      for (let i = 0; i < count - 1; i++) {
        const left = scene.participants[i];
        const right = scene.participants[i + 1];
        // Boxes are centred on x: left edge + width must clear the next box.
        expect(left.x + left.width, `boxes ${i} and ${i + 1} overlap`).toBeLessThanOrEqual(
          right.x,
        );
      }
    }
  });
});

describe("truncateSequenceLabel", () => {
  it("keeps short labels and ellipsizes long ones", () => {
    expect(truncateSequenceLabel("short", 20)).toBe("short");
    expect(truncateSequenceLabel("a much longer step description", 10)).toBe("a much lo…");
    expect(truncateSequenceLabel("abc", 0)).toBe("abc");
  });
});
