import { Inject, Injectable, Optional } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import {
  OpenAiCompatibleProvider,
  type FetchLike,
} from "../openai-compatible/openai-compatible.provider.js";

export const GROQ_FETCH = Symbol("GROQ_FETCH");

/**
 * Groq OpenAI-compatible adapter. GPT-OSS 120B supports strict JSON Schema and
 * accepts `max_completion_tokens` plus `reasoning_effort`. The free plan is
 * token-rate limited (8k TPM), so the stage budget must stay below that limit;
 * the provider reports 429 with Retry-After when it is exceeded.
 */
@Injectable()
export class GroqProvider extends OpenAiCompatibleProvider {
  constructor(
    @Inject(GROQ_FETCH) fetchImpl: FetchLike,
    @Optional()
    @Inject(APP_CONFIG)
    config?: Pick<AppConfig, "GROQ_REASONING_EFFORT">,
  ) {
    super(fetchImpl, {
      id: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      maxTokensField: "max_completion_tokens",
      providerRouting: false,
      temperature: 0.2,
      reasoningEffort: config?.GROQ_REASONING_EFFORT,
      reasoningMode: "groq",
    });
  }
}
