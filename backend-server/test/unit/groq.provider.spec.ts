import { describe, expect, it } from "vitest";
import type { GenerateStructuredInput } from "../../src/providers/model-provider.js";
import {
  GroqProvider,
} from "../../src/providers/groq/groq.provider.js";
import type { FetchLike } from "../../src/providers/openai-compatible/openai-compatible.provider.js";

function input(
  overrides: Partial<GenerateStructuredInput> = {},
): GenerateStructuredInput {
  return {
    model: "openai/gpt-oss-120b",
    system: "Return the answer.",
    messages: [{ role: "user", content: "Do the work." }],
    schemaName: "test_schema",
    jsonSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    maxOutputTokens: 100,
    timeoutMs: 1000,
    ...overrides,
  };
}

function response(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("GroqProvider", () => {
  it("uses the Groq endpoint and Groq-specific request fields", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchImpl = (async (inputUrl, requestInit) => {
      url = String(inputUrl);
      init = requestInit;
      return response();
    }) as FetchLike;
    const provider = new GroqProvider(fetchImpl, {
      GROQ_REASONING_EFFORT: "low",
    });

    const result = await provider
      .bind("gsk-test")
      .generateStructured(input());

    expect(result.data).toEqual({ ok: true });
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    if (!init || typeof init.body !== "string") {
      throw new Error("Expected a captured request body.");
    }
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(body.reasoning).toBeUndefined();
    expect(body.provider).toBeUndefined();
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "test_schema", strict: true },
    });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer gsk-test",
    );
  });
});
