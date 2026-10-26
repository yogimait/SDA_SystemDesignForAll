/**
 * F3 checkpoint tests for the LLD scene mapping:
 * every relationship kind gets its marker, every class kind is covered,
 * member rendering follows UML glyphs, layout is deterministic, selection
 * adjacency works. Fixture is handwritten (fixtures belong in tests only).
 */
import { describe, expect, it } from "vitest";
import type {
  DesignPattern,
  LldClass,
  LldModel,
  LldRelationship,
} from "@sda/contracts";
import {
  attributeText,
  buildLldScene,
  KIND_STEREOTYPE,
  MARKER_BY_KIND,
  methodText,
  nodeMemberFields,
  relatedElements,
} from "./lld-scene";

const attr = (
  name: string,
  type = "string",
  visibility: LldClass["attributes"][number]["visibility"] = "private",
  isStatic = false,
): LldClass["attributes"][number] => ({
  name,
  type,
  visibility,
  static: isStatic,
  description: "",
});

const meth = (
  name: string,
  signature = "(x: string): void",
  visibility: LldClass["methods"][number]["visibility"] = "public",
): LldClass["methods"][number] => ({ name, signature, visibility, description: "" });

const cls = (over: { id: string; name: string } & Partial<LldClass>): LldClass => ({
  kind: "class",
  responsibility: "does one thing",
  requirementRefs: [],
  rationale: "why this shape",
  alternatives: [],
  invariants: [],
  attributes: [],
  methods: [],
  ...over,
});

const rel = (
  id: string,
  kind: LldRelationship["kind"],
  sourceId: string,
  targetId: string,
  sourceMultiplicity: LldRelationship["sourceMultiplicity"] = "1",
  targetMultiplicity: LldRelationship["targetMultiplicity"] = "1",
  label = "",
): LldRelationship => ({
  id,
  kind,
  sourceId,
  targetId,
  sourceMultiplicity,
  targetMultiplicity,
  label,
  rationale: "why this relation",
});

const pattern: DesignPattern = {
  id: "pat_repo",
  name: "Repository",
  category: "structural",
  participantClassIds: ["cls_store", "cls_impl"],
  requirementRefs: ["fr_u1"],
  rationale: "keeps storage swappable",
  benefits: ["storage swap without callers caring"],
  drawbacks: ["extra indirection"],
  simplerAlternative: "plain function module",
  whenUnnecessary: "single storage backend forever",
};

export const fixture: LldModel = {
  classes: [
    cls({
      id: "cls_base",
      name: "UserRepositoryBase",
      kind: "abstract",
      attributes: [attr("users", "int", "private", true), attr("cache", "LruCache")],
      methods: [meth("find"), meth("save", "(user: User): void", "protected")],
    }),
    cls({ id: "cls_impl", name: "InMemoryUserStore" }),
    cls({ id: "cls_money", name: "Money", kind: "value_object" }),
    cls({ id: "cls_role", name: "RoleKind", kind: "enum" }),
    cls({ id: "cls_service", name: "UserService" }),
    cls({ id: "cls_store", name: "UserStore", kind: "interface" }),
  ],
  relationships: [
    rel("rel_aggregation", "aggregation", "cls_impl", "cls_role", "1", "0..*"),
    rel("rel_association", "association", "cls_service", "cls_impl", "1", "0..*", "queries"),
    rel("rel_composition", "composition", "cls_impl", "cls_money", "1", "1..*"),
    rel("rel_dependency", "dependency", "cls_base", "cls_role", "1", "1"),
    rel("rel_inheritance", "inheritance", "cls_impl", "cls_base", "1", "1"),
    rel("rel_realization", "realization", "cls_impl", "cls_store", "1", "1"),
  ],
  patterns: [pattern],
};

describe("marker and stereotype maps", () => {
  it("maps every relationship kind to a unique marker id", () => {
    expect(Object.keys(MARKER_BY_KIND).sort()).toEqual(
      ["aggregation", "association", "composition", "dependency", "inheritance", "realization"],
    );
    const ids = new Set(Object.values(MARKER_BY_KIND));
    expect(ids.size).toBe(6);
  });

  it("covers every class kind with a stereotype label", () => {
    expect(Object.keys(KIND_STEREOTYPE).sort()).toEqual(
      ["abstract", "class", "enum", "interface", "value_object"],
    );
    expect(KIND_STEREOTYPE.enum).toBe("enumeration");
    expect(KIND_STEREOTYPE.class).toBe("");
  });
});

describe("member rendering", () => {
  it("renders UML visibility and static glyphs on attributes", () => {
    expect(attributeText(attr("users", "int", "private", true))).toBe("-static users: int");
    expect(attributeText(attr("users", "int", "public", false))).toBe("+users: int");
    expect(attributeText(attr("users", "int", "protected", false))).toBe("#users: int");
    expect(attributeText(attr("users", "int", "package", false))).toBe("~users: int");
  });

  it("appends the full signature string to method names", () => {
    expect(methodText({ name: "addItem", signature: "(ownerId: UserId, item: Item): void", visibility: "public", description: "" })).toBe(
      "+addItem(ownerId: UserId, item: Item): void",
    );
  });

  it("splits member lines into attributes and methods", () => {
    const base = fixture.classes[0];
    const fields = nodeMemberFields(base);
    expect(fields.attributes).toEqual(["-static users: int", "-cache: LruCache"]);
    expect(fields.methods).toEqual(["+find(x: string): void", "#save(user: User): void"]);
  });
});

describe("buildLldScene", () => {
  it("lays out one node per class with computed geometry", () => {
    const scene = buildLldScene(fixture);
    expect(scene.nodes).toHaveLength(6);
    expect(scene.edges).toHaveLength(6);

    const base = scene.nodes.find((node) => node.id === "cls_base")!;
    expect(base.width).toBe(240);
    // 40 header + 4 members * 18 + 2 * 10 compartment padding
    expect(base.height).toBe(132);

    const role = scene.nodes.find((node) => node.id === "cls_role")!;
    expect(role.height).toBe(60);

    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });

  it("is deterministic: two runs produce identical scenes", () => {
    const first = buildLldScene(fixture);
    const second = buildLldScene(fixture);
    expect(second).toEqual(first);
  });

  it("widens nodes for long member lines and keeps short ones at the minimum", () => {
    const longSig = cls({
      id: "cls_long",
      name: "ItemRegistry",
      methods: [meth("addItem", "(ownerId: UserId, item: Item): Promise<InsertResult>")],
    });
    const scene = buildLldScene({
      classes: [...fixture.classes, longSig],
      relationships: [],
      patterns: [],
    });
    const long = scene.nodes.find((node) => node.id === "cls_long")!;
    expect(long.width).toBeGreaterThan(240);
    expect(long.width).toBeLessThanOrEqual(460);
    const store = scene.nodes.find((node) => node.id === "cls_impl")!;
    expect(store.width).toBe(240);
  });

  it("routes every relationship with points and keeps labels/multiplicities", () => {
    const scene = buildLldScene(fixture);
    for (const edge of scene.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(MARKER_BY_KIND[edge.kind]).toMatch(/^marker-/);
    }
    const association = scene.edges.find((edge) => edge.id === "rel_association")!;
    expect(association.label).toBe("queries");
    expect(association.fromMultiplicity).toBe("1");
    expect(association.toMultiplicity).toBe("0..*");
    const aggregation = scene.edges.find((edge) => edge.id === "rel_aggregation")!;
    expect(aggregation.fromMultiplicity).toBe("1");
    expect(aggregation.toMultiplicity).toBe("0..*");
  });

  it("survives a 30-class model quickly (perf sanity)", () => {
    const classes: LldClass[] = Array.from({ length: 30 }, (_, i) =>
      cls({ id: `cls_c${i}`, name: `Class${i}`, methods: [meth("run", "(): void")] }),
    );
    const relationships: LldRelationship[] = [];
    for (let i = 1; i < 30; i += 1) {
      relationships.push(rel(`rel_chain${i}`, "inheritance", `cls_c${i}`, `cls_c${i - 1}`));
    }
    const assoc = rel("rel_assoc", "association", "cls_c0", "cls_c29", "1", "0..*");
    relationships.push(assoc);

    const started = performance.now();
    const scene = buildLldScene({ classes, relationships, patterns: [] });
    const elapsed = performance.now() - started;

    expect(scene.nodes).toHaveLength(30);
    expect(scene.edges).toHaveLength(30);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe("relatedElements", () => {
  it("collects incident relationships and endpoints for a class", () => {
    const { relationshipIds, classIds } = relatedElements(fixture, {
      type: "class",
      id: "cls_impl",
    });
    // realization (source), inheritance (source), association (target),
    // aggregation (source), composition (source) — not the dependency.
    expect([...relationshipIds].sort()).toEqual([
      "rel_aggregation",
      "rel_association",
      "rel_composition",
      "rel_inheritance",
      "rel_realization",
    ]);
    expect([...classIds].sort()).toEqual([
      "cls_base",
      "cls_impl",
      "cls_money",
      "cls_role",
      "cls_service",
      "cls_store",
    ]);
  });

  it("collects participant classes for a pattern", () => {
    const { relationshipIds, classIds } = relatedElements(fixture, {
      type: "pattern",
      id: "pat_repo",
    });
    expect(relationshipIds.size).toBe(0);
    expect([...classIds]).toEqual(["cls_store", "cls_impl"]);
    expect([...classIds]).toContain("cls_impl");
  });

  it("returns empty sets without a selection", () => {
    const { relationshipIds, classIds } = relatedElements(fixture, null);
    expect(relationshipIds.size).toBe(0);
    expect(classIds.size).toBe(0);
  });

  it("ignores unknown ids instead of throwing", () => {
    const { relationshipIds, classIds } = relatedElements(fixture, {
      type: "pattern",
      id: "pat_absent",
    });
    expect(relationshipIds.size).toBe(0);
    expect(classIds.size).toBe(0);
  });
});
