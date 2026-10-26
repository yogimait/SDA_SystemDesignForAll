import { describe, expect, it } from "vitest";
import type { GenerateStructuredInput } from "../../src/providers/model-provider.js";
import {
  extractJsonText,
  type FetchLike,
  OpenRouterProvider,
} from "../../src/providers/openrouter/openrouter.provider.js";

function input(
  overrides: Partial<GenerateStructuredInput> = {},
): GenerateStructuredInput {
  return {
    model: "test/model",
    system: "Return the answer.",
    messages: [{ role: "user", content: "Do the work." }],
    schemaName: "test_schema",
    jsonSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    maxOutputTokens: 100,
    timeoutMs: 1000,
    ...overrides,
  };
}

function success(content: string, usage = true): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      ...(usage
        ? {
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }
        : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function failure(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface ScriptedFetch {
  fetch: FetchLike;
  calls: RequestInit[];
}

function scriptedFetch(responses: Response[]): ScriptedFetch {
  const calls: RequestInit[] = [];
  let index = 0;
  return {
    calls,
    fetch: async (_url, init) => {
      calls.push(init ?? {});
      const response = responses[index];
      index += 1;
      if (!response) {
        throw new Error("No scripted response left.");
      }
      return response;
    },
  };
}

function bodyOf(call: RequestInit): Record<string, unknown> {
  if (typeof call.body !== "string") {
    throw new Error("Expected a JSON string request body.");
  }
  return JSON.parse(call.body) as Record<string, unknown>;
}

function headersOf(call: RequestInit): Record<string, string> {
  return call.headers as Record<string, string>;
}

describe("OpenRouterProvider", () => {
  it("sends json_schema mode with the bound key and parses usage", async () => {
    const scripted = scriptedFetch([success('{"ok":true}')]);
    const provider = new OpenRouterProvider(scripted.fetch);

    const result = await provider
      .bind("sk-or-test")
      .generateStructured(input());

    expect(result.data).toEqual({ ok: true });
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    const call = scripted.calls[0];
    expect(headersOf(call).Authorization).toBe("Bearer sk-or-test");
    expect(bodyOf(call).response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "test_schema", strict: true },
    });
  });

  it("sends the configured reasoning effort and omits it when off", async () => {
    const low = scriptedFetch([success('{"ok":true}')]);
    const lowProvider = new OpenRouterProvider(low.fetch, {
      OPENROUTER_REASONING_EFFORT: "low",
    });
    await lowProvider.bind("sk-test").generateStructured(input());
    expect(bodyOf(low.calls[0]).reasoning).toEqual({ effort: "low" });

    const off = scriptedFetch([success('{"ok":true}')]);
    const offProvider = new OpenRouterProvider(off.fetch, {
      OPENROUTER_REASONING_EFFORT: "off",
    });
    await offProvider.bind("sk-test").generateStructured(input());
    expect(bodyOf(off.calls[0]).reasoning).toBeUndefined();
  });

  it("falls back from json_schema to json_object and caches the mode", async () => {
    const scripted = scriptedFetch([
      failure(400, "response_format json_schema is not supported"),
      success('{"ok":true}'),
      success('{"ok":true}'),
    ]);
    const provider = new OpenRouterProvider(scripted.fetch);
    const bound = provider.bind("sk-test");

    await bound.generateStructured(input());
    expect(scripted.calls).toHaveLength(2);
    expect(bodyOf(scripted.calls[1]).response_format).toEqual({
      type: "json_object",
    });

    await bound.generateStructured(input());
    expect(scripted.calls).toHaveLength(3);
    expect(bodyOf(scripted.calls[2]).response_format).toEqual({
      type: "json_object",
    });
  });

  it("falls back to prompt mode and extracts fenced JSON", async () => {
    const scripted = scriptedFetch([
      failure(422, "unsupported response_format"),
      failure(400, "json_schema is unsupported"),
      success('Here you go:\n```json\n{"ok":true}\n```'),
    ]);
    const provider = new OpenRouterProvider(scripted.fetch);

    const result = await provider
      .bind("sk-test")
      .generateStructured(input());

    expect(result.data).toEqual({ ok: true });
    const promptBody = bodyOf(scripted.calls[2]);
    expect(promptBody.response_format).toBeUndefined();
    const messages = promptBody.messages as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("JSON Schema exactly");
  });

  it("rejects a blank API key before calling the provider", async () => {
    const scripted = scriptedFetch([]);
    const provider = new OpenRouterProvider(scripted.fetch);
    await expect(
      provider.bind("  ").generateStructured(input()),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
    expect(scripted.calls).toHaveLength(0);
  });

  it.each([
    [401, "bad key", "PROVIDER_AUTH_FAILED"],
    [403, "forbidden", "PROVIDER_AUTH_FAILED"],
    [500, "upstream", "PROVIDER_UNAVAILABLE"],
    [408, "timeout", "PROVIDER_TIMEOUT"],
    [400, "invalid request", "PROVIDER_UNSUPPORTED_CAPABILITY"],
  ])(
    "maps provider status %i to a normalized error code",
    async (status, message, code) => {
      const scripted = scriptedFetch([failure(status, message)]);
      const provider = new OpenRouterProvider(scripted.fetch);
      await expect(
        provider.bind("sk-test").generateStructured(input()),
      ).rejects.toMatchObject({ code });
    },
  );

  it("maps context-length failures without falling through the ladder", async () => {
    const scripted = scriptedFetch([
      failure(400, "This model's maximum context length is 8192 tokens"),
    ]);
    const provider = new OpenRouterProvider(scripted.fetch);

    await expect(
      provider.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNSUPPORTED_CAPABILITY",
      details: { reason: "context_length" },
    });
    expect(scripted.calls).toHaveLength(1);
  });

  it("maps 429 and exposes retry-after seconds", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "rate limited" } }),
      { status: 429, headers: { "retry-after": "120" } },
    );
    const provider = new OpenRouterProvider(scriptedFetch([response]).fetch);
    await expect(
      provider.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      details: { retryAfterSeconds: 120 },
    });
  });

  it("maps network and timeout failures", async () => {
    const network = new OpenRouterProvider(async () => {
      throw new Error("socket closed");
    });
    await expect(
      network.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const timeout = new OpenRouterProvider(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    await expect(
      timeout.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("times out while reading a slow response body", async () => {
    const slowBody = new OpenRouterProvider(async (_url, init) => {
      const signal = init?.signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      } as unknown as Response;
    });

    await expect(
      slowBody
        .bind("sk-test")
        .generateStructured(input({ timeoutMs: 20 })),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      details: { timeoutMs: 20 },
    });
  });

  it("rejects output truncated by the token limit", async () => {
    const provider = new OpenRouterProvider(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"a":1}' }, finish_reason: "length" },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 100,
            total_tokens: 200,
            completion_tokens_details: { reasoning_tokens: 40 },
          },
        }),
        { status: 200 },
      ),
    );
    await expect(
      provider.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      details: {
        reason: "truncated_output",
        maxOutputTokens: 100,
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        reasoningTokens: 40,
      },
    });
  });

  it("treats empty truncated output as truncation, not empty output", async () => {
    const provider = new OpenRouterProvider(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" }, finish_reason: "length" }],
        }),
        { status: 200 },
      ),
    );
    await expect(
      provider.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      details: { reason: "truncated_output", finishReason: "length" },
    });
  });

  it("rejects empty, malformed, and invalid JSON output", async () => {
    for (const response of [
      success(""),
      new Response("<html>bad gateway</html>", { status: 200 }),
      success("not json at all"),
    ]) {
      const provider = new OpenRouterProvider(
        scriptedFetch([response]).fetch,
      );
      await expect(
        provider.bind("sk-test").generateStructured(input()),
      ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    }
  });

  it("rejects oversized output without storing it", async () => {
    const provider = new OpenRouterProvider(
      scriptedFetch([success("x".repeat(1_000_001))]).fetch,
    );
    await expect(
      provider.bind("sk-test").generateStructured(input()),
    ).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      details: { reason: "output_too_large" },
    });
  });

  it("omits usage when the provider omits it", async () => {
    const provider = new OpenRouterProvider(
      scriptedFetch([success('{"ok":true}', false)]).fetch,
    );
    const result = await provider
      .bind("sk-test")
      .generateStructured(input());
    expect(result.usage).toBeUndefined();
  });
});

describe("extractJsonText", () => {
  it("unwraps fenced JSON", () => {
    expect(extractJsonText("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });

  it("slices prose around a JSON object", () => {
    expect(extractJsonText('Result: {"a":1} done.')).toBe('{"a":1}');
  });

  it("ignores trailing commentary containing braces", () => {
    expect(extractJsonText('{"a":{"b":2}} Note: use {curly} braces.')).toBe(
      '{"a":{"b":2}}',
    );
  });

  it("ignores braces inside string values", () => {
    expect(extractJsonText('{"text":"a } b","nested":{"c":1}}')).toBe(
      '{"text":"a } b","nested":{"c":1}}',
    );
  });

  it("reports an incomplete object as truncated", () => {
    expect(() => extractJsonText('{"a":')).toThrow("incomplete JSON object");
  });

  it("throws when no object is present", () => {
    expect(() => extractJsonText("no json here")).toThrow(
      "did not contain a JSON object",
    );
  });
});
