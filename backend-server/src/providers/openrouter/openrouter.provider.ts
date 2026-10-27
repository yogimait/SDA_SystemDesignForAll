import { Inject, Injectable, Optional } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import {
  OpenAiCompatibleProvider,
  extractJsonText,
  type FetchLike,
} from "../openai-compatible/openai-compatible.provider.js";

export const OPENROUTER_FETCH = Symbol("OPENROUTER_FETCH");

export { extractJsonText, type FetchLike };

/**
 * OpenRouter adapter. BYOK: the key is bound per request by the registry and is
 * never stored or logged. Falls back down the structured-output ladder when a
 * model does not support the stricter mode, remembering the result per model.
 */
@Injectable()
export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(
    @Inject(OPENROUTER_FETCH) fetchImpl: FetchLike,
    @Optional()
    @Inject(APP_CONFIG)
    config?: Pick<AppConfig, "OPENROUTER_REASONING_EFFORT">,
  ) {
    super(fetchImpl, {
      id: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      maxTokensField: "max_tokens",
      providerRouting: true,
      temperature: 0.2,
      reasoningEffort: config?.OPENROUTER_REASONING_EFFORT,
      reasoningMode: "openrouter",
      headers: { "X-Title": "System Design All-in-One" },
    });
  }
}
