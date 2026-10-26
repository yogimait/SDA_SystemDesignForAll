import { z } from "@sda/contracts";

export type JsonSchemaObject = Record<string, unknown>;

/**
 * Keywords providers reject or ignore in strict structured-output mode.
 * Server-side Zod validation remains the authority; these are only hints.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "examples",
  "default",
  "readOnly",
  "writeOnly",
  "deprecated",
  "contentEncoding",
  "contentMediaType",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "propertyNames",
  "unevaluatedProperties",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeNode(node: unknown, strict: boolean): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => sanitizeNode(item, strict));
  }
  if (!isRecord(node)) {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      continue;
    }
    if (key === "additionalProperties" && value === true) {
      continue;
    }
    result[key] = sanitizeNode(value, strict);
  }

  if (isRecord(result.properties)) {
    result.additionalProperties = false;
    if (strict) {
      // OpenAI-style strict mode requires every declared property.
      result.required = Object.keys(result.properties);
    }
  }

  return result;
}

/** Zod 4 schema → provider-safe JSON Schema. */
export function zodToJsonSchema(
  schema: z.ZodType,
  options: { strict?: boolean } = {},
): JsonSchemaObject {
  const raw = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "output",
  });
  return sanitizeNode(raw, options.strict ?? true) as JsonSchemaObject;
}
