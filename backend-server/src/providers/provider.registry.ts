import { Inject, Injectable } from "@nestjs/common";
import type { ProviderInfo } from "@sda/contracts";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../common/errors/app-error.js";
import type { ModelProvider } from "./model-provider.js";
import { MockProvider } from "./mock/mock.provider.js";
import { OpenRouterProvider } from "./openrouter/openrouter.provider.js";

@Injectable()
export class ProviderRegistry {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly openrouter: OpenRouterProvider,
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

  /** Validates provider selection and binds the BYOK key for one run. */
  resolve(providerId?: string, apiKey?: string): ModelProvider {
    if (this.config.MOCK_PROVIDER) {
      return this.mock;
    }

    const id = providerId ?? this.config.DEFAULT_PROVIDER;
    if (id !== "openrouter") {
      throw new AppError(
        "VALIDATION_ERROR",
        `Unknown model provider "${id}".`,
        { provider: id, available: ["openrouter"] },
      );
    }
    const key =
      apiKey?.trim() ||
      (this.config.NODE_ENV === "production"
        ? undefined
        : this.config.OPENROUTER_API_KEY);
    if (!key) {
      throw new AppError(
        "PROVIDER_AUTH_FAILED",
        "A provider API key is required in the x-provider-api-key header.",
      );
    }
    return this.openrouter.bind(key);
  }

  list(): ProviderInfo[] {
    return [
      {
        id: "openrouter",
        models: [this.config.DEFAULT_MODEL],
        supportsStructuredOutput: true,
      },
    ];
  }
}
