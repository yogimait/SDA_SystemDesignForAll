import { Inject, Injectable } from "@nestjs/common";
import type { ProviderInfo } from "@sda/contracts";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../common/errors/app-error.js";
import type { ModelProvider } from "./model-provider.js";
import { MockProvider } from "./mock/mock.provider.js";
import { OpenRouterProvider } from "./openrouter/openrouter.provider.js";
import { GroqProvider } from "./groq/groq.provider.js";

@Injectable()
export class ProviderRegistry {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly openrouter: OpenRouterProvider,
    private readonly groq: GroqProvider,
    private readonly mock: MockProvider,
  ) {}

  get mockEnabled(): boolean {
    return this.config.MOCK_PROVIDER;
  }

  get defaultProvider(): string {
    return this.config.DEFAULT_PROVIDER;
  }

  get defaultModel(): string {
    return this.config.DEFAULT_MODEL;
  }

  /** Validates provider selection and binds the hosted key for one run. */
  resolve(providerId?: string, apiKey?: string): ModelProvider {
    if (this.config.MOCK_PROVIDER) {
      return this.mock;
    }

    const id = providerId ?? this.config.DEFAULT_PROVIDER;
    const configuredKey =
      id === "openrouter"
        ? this.config.OPENROUTER_API_KEY
        : id === "groq"
          ? this.config.GROQ_API_KEY
          : undefined;
    if (id !== "openrouter" && id !== "groq") {
      throw new AppError(
        "VALIDATION_ERROR",
        `Unknown model provider "${id}".`,
        { provider: id, available: ["openrouter", "groq"] },
      );
    }
    // The hosted account key powers the product. A request header can still
    // override it for internal tooling, but the client no longer sends one.
    const key = apiKey?.trim() || configuredKey;
    if (!key) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "The hosted model provider key is not configured on this deployment.",
      );
    }
    return id === "groq"
      ? this.groq.bind(key)
      : this.openrouter.bind(key);
  }

  list(): ProviderInfo[] {
    return [
      {
        id: "openrouter",
        models: this.config.OPENROUTER_MODELS,
        supportsStructuredOutput: true,
      },
      {
        id: "groq",
        models: this.config.GROQ_MODELS,
        supportsStructuredOutput: true,
      },
    ];
  }
}
