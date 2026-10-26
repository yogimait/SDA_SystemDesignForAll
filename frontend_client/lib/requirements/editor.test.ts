import { describe, expect, it } from "vitest";
import {
  addFunctionalRow,
  functionalPayload,
  hasEmptyText,
  moveRow,
  nextLocalKey,
  nonFunctionalPayload,
  removeRow,
  rowsFromSpec,
  updateRow,
  type FunctionalRow,
  type NonFunctionalRow,
} from "./editor";

const row = (id: string, text = id): FunctionalRow => ({
  key: id,
  id,
  text,
  priority: "must",
});

describe("editor rows", () => {
  it("adds new rows with unique local keys without touching server ids", () => {
    const rows = addFunctionalRow([
      row("fr_1"),
      addFunctionalRow([])[0] as FunctionalRow,
    ]);
    const keys = rows.map((r) => r.key);
    expect(keys[0]).toBe("fr_1");
    expect(keys[1]).toMatch(/^local-/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("edits rows by key and keeps other rows intact", () => {
    const rows = [row("fr_1", "old"), row("fr_2", "keep")];
    const edited = updateRow(rows, "fr_1", { text: "new text", priority: "should" });
    expect(edited[0]).toMatchObject({ id: "fr_1", text: "new text", priority: "should" });
    expect(edited[1]).toBe(rows[1]);
  });

  it("deletes by key", () => {
    const rows = [row("fr_1"), row("fr_2")];
    expect(removeRow(rows, "fr_1").map((r) => r.key)).toEqual(["fr_2"]);
  });

  it("moving rows preserves ids attached to the same content", () => {
    const rows = [row("fr_1", "first"), row("fr_2", "second"), row("fr_3", "third")];
    const moved = moveRow(rows, "fr_3", -1);
    expect(moved.map((r) => r.id)).toEqual(["fr_1", "fr_3", "fr_2"]);
    expect(moved.map((r) => r.text)).toEqual(["first", "third", "second"]);
    // border moves are no-ops
    expect(moveRow(moved, "fr_1", -1).map((r) => r.id)).toEqual([
      "fr_1",
      "fr_3",
      "fr_2",
    ]);
  });

  it("flags empty descriptions for the save guard", () => {
    expect(hasEmptyText([{ text: "ok" }])).toBe(false);
    expect(hasEmptyText([{ text: "  " }])).toBe(true);
  });
});

describe("payloads", () => {
  it("sends server rows with their id and local rows without one", () => {
    const local = addFunctionalRow([row("fr_1")]);
    const withText = updateRow(local, "local-1", { text: "user typed" });
    const payload = functionalPayload(withText);
    expect(payload[0]).toEqual({ id: "fr_1", text: "fr_1", priority: "must" });
    expect(payload[1]).toEqual({ text: "user typed", priority: "must" });
    expect(Object.hasOwn(payload[1], "id")).toBe(false);
  });

  it("trims payload text and keeps non-functional structure", () => {
    const rows: NonFunctionalRow[] = [
      {
        key: "nfr_1",
        id: "nfr_1",
        text: "  audit logs ",
        priority: "must",
        category: "security",
        target: "x",
      },
    ];
    const payload = nonFunctionalPayload(rows);
    expect(payload[0]).toEqual({
      id: "nfr_1",
      text: "audit logs",
      priority: "must",
      category: "security",
      target: "x",
    });
  });
});

describe("keys and spec mapping", () => {
  it("nextLocalKey always exceeds existing local numbers", () => {
    expect(nextLocalKey([])).toBe("local-1");
    expect(nextLocalKey([{ key: "local-3" }, { key: "fr_1" }])).toBe("local-4");
  });

  it("rowsFromSpec maps server ids to keys and keeps targets", () => {
    const rows = rowsFromSpec({
      functional: [{ id: "fr_1", kind: "functional", text: "login", priority: "must" }],
      nonFunctional: [
        {
          id: "nfr_1",
          kind: "nonfunctional",
          text: "fast",
          priority: "should",
          category: "performance",
          target: "p95 < 200ms",
        },
      ],
      assumptions: [],
      clarifications: [],
    });
    expect(rows.functional[0]).toEqual({
      key: "fr_1",
      id: "fr_1",
      text: "login",
      priority: "must",
    });
    expect(rows.nonFunctional[0].target).toBe("p95 < 200ms");
  });
});
