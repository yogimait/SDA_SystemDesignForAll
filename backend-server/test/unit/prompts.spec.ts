import { describe, expect, it } from "vitest";
import { lldDsaSystemPrompt } from "../../src/providers/prompts/index.js";

describe("lldDsaSystemPrompt", () => {
  it("includes the design-pattern catalog and connectivity rules", () => {
    const prompt = lldDsaSystemPrompt();
    for (const name of [
      "Singleton",
      "Abstract Factory",
      "Builder with Director",
      "Object Adapter",
      "Virtual Proxy",
      "Chain of Responsibility",
      "Template Method",
      "Visitor",
      "Null Object",
    ]) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("Every class, abstract class, and interface");
    expect(prompt).toContain("must not repeat the method name");
    expect(prompt).toContain("never add a pattern just to cover the catalog");
  });
});
