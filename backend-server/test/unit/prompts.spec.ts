import { describe, expect, it } from "vitest";
import {
  dsaSystemPrompt,
  hldSystemPrompt,
  learningSystemPrompt,
  lldSystemPrompt,
  requirementsSystemPrompt,
} from "../../src/providers/prompts/index.js";

describe("split architecture prompts", () => {
  it("keeps the design-pattern catalog and connectivity rules in the LLD prompt", () => {
    const prompt = lldSystemPrompt();
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
    expect(prompt).toContain("Do not output DSA recommendations or learning steps");
  });

  it("scopes DSA and learning prompts to their own output", () => {
    expect(dsaSystemPrompt()).toContain("produce only the DSA analysis");
    expect(dsaSystemPrompt()).toContain("Do not output classes");
    expect(learningSystemPrompt()).toContain("produce only the learning walkthrough");
    expect(learningSystemPrompt()).toContain("Never use requirement ids");
  });

  it("asks for contradiction checks and execution trust boundaries", () => {
    expect(requirementsSystemPrompt()).toContain("contradictions");
    expect(requirementsSystemPrompt()).toContain("clarification question");
    expect(hldSystemPrompt()).toContain("trust boundary");
    expect(hldSystemPrompt()).toContain("security non-functional requirement");
    expect(lldSystemPrompt()).toContain("runtime adapter boundary");
    expect(lldSystemPrompt()).toContain("bounded concurrency");
  });
});
