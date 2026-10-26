import { z } from "@sda/contracts";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "../../src/providers/json-schema.js";

describe("zodToJsonSchema", () => {
  const schema = z.object({
    name: z.string().min(3).max(10),
    tags: z.array(z.string()).default([]),
    optional: z.string().optional(),
    nested: z.object({ count: z.number().int().min(1) }),
  });

  it("drops provider-rejected keywords", () => {
    const json = JSON.stringify(zodToJsonSchema(schema));
    for (const keyword of [
      "minLength",
      "maxLength",
      "default",
      "minItems",
      "minimum",
      "$schema",
    ]) {
      expect(json).not.toContain(`"${keyword}"`);
    }
  });

  it("closes every object and requires every property in strict mode", () => {
    const json = zodToJsonSchema(schema) as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        nested: { additionalProperties: boolean; required: string[] };
      };
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.required.sort()).toEqual(
      ["name", "tags", "optional", "nested"].sort(),
    );
    expect(json.properties.nested.additionalProperties).toBe(false);
    expect(json.properties.nested.required).toEqual(["count"]);
  });

  it("keeps the schema's own required list when strict mode is off", () => {
    const json = zodToJsonSchema(schema, { strict: false }) as {
      required: string[];
    };
    expect(json.required).not.toContain("optional");
  });
});
