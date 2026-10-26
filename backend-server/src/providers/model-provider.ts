import type { TokenUsage } from "@sda/contracts";
import type { JsonSchemaObject } from "./json-schema.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateStructuredInput {
  model: string;
  system: string;
  messages: ChatMessage[];
  /** Stable name sent to the provider; also selects mock fixtures. */
  schemaName: string;
  jsonSchema: JsonSchemaObject;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface GeneratedStructured {
  data: unknown;
  usage?: TokenUsage;
}

/**
 * Boundary for every model vendor. Orchestration depends on this interface and
 * the registry, never on a concrete adapter.
 */
export interface ModelProvider {
  id: string;
  generateStructured(
    input: GenerateStructuredInput,
  ): Promise<GeneratedStructured>;
}
