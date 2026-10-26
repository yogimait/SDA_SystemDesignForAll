import { Inject, Injectable, Optional } from "@nestjs/common";
import type { TokenUsage } from "@sda/contracts";
import { AppError } from "../../common/errors/app-error.js";
import { redactSecrets } from "../../common/logging/redact.js";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import type {
  GenerateStructuredInput,
  GeneratedStructured,
  ModelProvider,
} from "../model-provider.js";

export const OPENROUTER_FETCH = Symbol("OPENROUTER_FETCH");

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type StructuredMode = "json_schema" | "json_object" | "prompt";
const MODES: StructuredMode[] = ["json_schema", "json_object", "prompt"];
const MAX_OUTPUT_CHARS = 1_000_000;

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: { message?: string; code?: number | string };
}

interface RequestOutcome {
  kind: "ok" | "capability";
  content?: string;
  usage?: TokenUsage;
}

/**
 * OpenRouter adapter. BYOK: the key is bound per request by the registry and is
 * never stored or logged. Falls back down the structured-output ladder when a
 * model does not support the stricter mode, remembering the result per model.
 */
@Injectable()
export class OpenRouterProvider {
  readonly id = "openrouter";
  private readonly modeByModel = new Map<string, StructuredMode>();

  constructor(
    @Inject(OPENROUTER_FETCH) private readonly fetchImpl: FetchLike,
    @Optional()
    @Inject(APP_CONFIG)
    private readonly config?: Pick<
      AppConfig,
      "OPENROUTER_REASONING_EFFORT"
    >,
  ) {}

  bind(apiKey: string): ModelProvider {
    return {
      id: this.id,
      generateStructured: (input) =>
        this.generateStructured(input, apiKey),
    };
  }

  async generateStructured(
    input: GenerateStructuredInput,
    apiKey: string,
  ): Promise<GeneratedStructured> {
    if (!apiKey.trim()) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "A provider API key is required in the x-provider-api-key header.",
      );
    }

    const startMode = this.modeByModel.get(input.model) ?? "json_schema";
    for (let index = MODES.indexOf(startMode); index < MODES.length; index += 1) {
      const mode = MODES[index];
      const outcome = await this.request(input, apiKey, mode);
      if (outcome.kind === "ok") {
        this.modeByModel.set(input.model, mode);
        return {
          data: parseJsonContent(outcome.content ?? ""),
          usage: outcome.usage,
        };
      }
      if (index === MODES.length - 1) {
        break;
      }
      this.modeByModel.set(input.model, MODES[index + 1]);
    }

    throw new AppError(
      "PROVIDER_UNSUPPORTED_CAPABILITY",
      "The model does not support any structured-output mode required by this stage.",
      { model: input.model },
    );
  }

  private async request(
    input: GenerateStructuredInput,
    apiKey: string,
    mode: StructuredMode,
  ): Promise<RequestOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    const messages = buildMessages(input, mode);
    const body: Record<string, unknown> = {
      model: input.model,
      messages,
      temperature: 0.2,
      max_tokens: input.maxOutputTokens,
    };
    const reasoningEffort = this.config?.OPENROUTER_REASONING_EFFORT;
    if (reasoningEffort && reasoningEffort !== "off") {
      body.reasoning = { effort: reasoningEffort };
    }

    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      };
      body.provider = { require_parameters: true };
    } else if (mode === "json_object") {
      body.response_format = { type: "json_object" };
    }

    try {
      const response = await this.fetchImpl(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "System Design All-in-One",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      // Keep the abort timer active while the body streams; headers can arrive
      // long before the generated JSON finishes.
      const text = await response.text();
      if (!response.ok) {
        return this.handleErrorResponse(response, text, input.model, mode);
      }

      let parsed: OpenRouterResponse;
      try {
        parsed = JSON.parse(text) as OpenRouterResponse;
      } catch {
        throw new AppError(
          "INVALID_MODEL_OUTPUT",
          "The model provider returned a malformed response envelope.",
          { reason: "provider_envelope", model: input.model },
        );
      }

      const content = parsed.choices?.[0]?.message?.content;
      const finishReason = parsed.choices?.[0]?.finish_reason;
      if (finishReason === "length") {
        throw new AppError(
          "INVALID_MODEL_OUTPUT",
          "The model response was truncated before completion.",
          {
            reason: "truncated_output",
            finishReason,
            model: input.model,
            maxOutputTokens: input.maxOutputTokens,
            usage: normalizeUsage(parsed.usage),
            reasoningTokens:
              parsed.usage?.completion_tokens_details?.reasoning_tokens,
          },
        );
      }
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new AppError(
          "INVALID_MODEL_OUTPUT",
          "The model returned an empty response.",
          { reason: "empty_output", model: input.model },
        );
      }
      if (content.length > MAX_OUTPUT_CHARS) {
        throw new AppError(
          "INVALID_MODEL_OUTPUT",
          "The model response exceeded the maximum accepted size.",
          { reason: "output_too_large", model: input.model },
        );
      }

      return {
        kind: "ok",
        content,
        usage: normalizeUsage(parsed.usage),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" || controller.signal.aborted)
      ) {
        throw new AppError(
          "PROVIDER_TIMEOUT",
          `The model provider did not finish within ${Math.round(
            input.timeoutMs / 1000,
          )} seconds.`,
          { timeoutMs: input.timeoutMs },
        );
      }
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The model provider could not be reached.",
        { reason: "network" },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private handleErrorResponse(
    response: Response,
    text: string,
    model: string,
    mode: StructuredMode,
  ): RequestOutcome {
    const status = response.status;
    const providerMessage = providerErrorMessage(text);

    if (status === 401 || status === 403) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "The model provider rejected the API key.",
        { providerStatus: status },
      );
    }

    if (status === 429) {
      const retryAfterSeconds = parseRetryAfter(
        response.headers.get("retry-after"),
      );
      throw new AppError(
        "PROVIDER_RATE_LIMITED",
        "The model provider is rate limiting requests. Try again shortly.",
        { providerStatus: status, retryAfterSeconds },
      );
    }

    if (status === 408 || status === 504) {
      throw new AppError(
        "PROVIDER_TIMEOUT",
        "The model provider timed out while generating the response.",
        { providerStatus: status },
      );
    }

    if (/context length|maximum context|too many tokens|context_length/i.test(providerMessage)) {
      throw new AppError(
        "PROVIDER_UNSUPPORTED_CAPABILITY",
        "The prompt exceeded the model's context window.",
        { providerStatus: status, reason: "context_length", model },
      );
    }

    const capabilityFailure =
      [400, 404, 422].includes(status) &&
      /response_format|json_schema|structured|unsupported|require_parameters|no endpoints/i.test(
        providerMessage,
      );
    if (capabilityFailure && mode !== "prompt") {
      return { kind: "capability" };
    }

    if (status >= 500) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The model provider is currently unavailable. Try again later.",
        { providerStatus: status },
      );
    }

    throw new AppError(
      "PROVIDER_UNSUPPORTED_CAPABILITY",
      "The model provider rejected this generation request.",
      {
        providerStatus: status,
        providerMessage: redactSecrets(providerMessage).slice(0, 300),
      },
    );
  }
}

function buildMessages(
  input: GenerateStructuredInput,
  mode: StructuredMode,
): Array<{ role: string; content: string }> {
  let system = input.system;
  if (mode !== "json_schema") {
    system += `\n\nReturn one JSON object only, matching this JSON Schema exactly. Do not wrap it in Markdown.\n${JSON.stringify(
      input.jsonSchema,
    )}`;
  }
  return [
    { role: "system", content: system },
    ...input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function providerErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Fall through to the raw body slice.
  }
  return text.slice(0, 300);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function normalizeUsage(
  usage: OpenRouterResponse["usage"],
): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
  };
}

/** Tolerant extraction for prompt-only mode (code fences, preamble text). */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() ?? trimmed;
  const start = source.indexOf("{");
  if (start === -1) {
    throw new AppError(
      "INVALID_MODEL_OUTPUT",
      "The model response did not contain a JSON object.",
      { reason: "no_json_object" },
    );
  }

  // Return the first complete object, ignoring trailing commentary that may
  // contain braces. Track strings so braces inside values do not affect depth.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new AppError(
    "INVALID_MODEL_OUTPUT",
    "The model response contained an incomplete JSON object.",
    { reason: "truncated_json" },
  );
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(extractJsonText(content)) as unknown;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "INVALID_MODEL_OUTPUT",
      "The model returned invalid JSON.",
      { reason: "json_parse" },
    );
  }
}
