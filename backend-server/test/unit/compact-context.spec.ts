import type { HldModel, LldDsaOutput } from "@sda/contracts";
import { describe, expect, it } from "vitest";
import {
  compactHld,
  compactLld,
} from "../../src/providers/prompts/compact-context.js";
import { MockProvider } from "../../src/providers/mock/mock.provider.js";

async function mockData(schemaName: string): Promise<unknown> {
  const provider = new MockProvider();
  return (
    await provider.generateStructured({
      model: "test/model",
      system: "",
      messages: [],
      schemaName,
      jsonSchema: {},
      maxOutputTokens: 100,
      timeoutMs: 1000,
    })
  ).data;
}

describe("compact prompt context", () => {
  it("keeps ids and structure while dropping long rationale fields", async () => {
    const hld = (await mockData("hld_model")) as HldModel;
    const compact = compactHld(hld);
    expect(compact.components[0]?.id).toBe(hld.components[0]?.id);
    expect(compact.connections[0]?.fromComponentId).toBe(
      hld.connections[0]?.fromComponentId,
    );
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(hld).length,
    );

    const section = (await mockData("lld_dsa_model")) as LldDsaOutput;
    const compactLldModel = compactLld(section.lld);
    expect(compactLldModel.classes[0]?.id).toBe(section.lld.classes[0]?.id);
    expect(JSON.stringify(compactLldModel).length).toBeLessThan(
      JSON.stringify(section.lld).length,
    );
  });
});
