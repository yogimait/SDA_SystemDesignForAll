import { Controller, Get, Module } from "@nestjs/common";
import type { ProvidersResponse } from "@sda/contracts";
import { ProviderRegistry } from "./provider.registry.js";
import { MockProvider } from "./mock/mock.provider.js";
import {
  OPENROUTER_FETCH,
  OpenRouterProvider,
} from "./openrouter/openrouter.provider.js";
import { GROQ_FETCH, GroqProvider } from "./groq/groq.provider.js";

@Controller("providers")
export class ProvidersController {
  constructor(private readonly registry: ProviderRegistry) {}

  @Get()
  list(): ProvidersResponse {
    return {
      providers: this.registry.list(),
      defaultProvider: this.registry.defaultProvider,
      defaultModel: this.registry.defaultModel,
      mock: this.registry.mockEnabled,
    };
  }
}

@Module({
  controllers: [ProvidersController],
  providers: [
    OpenRouterProvider,
    GroqProvider,
    MockProvider,
    ProviderRegistry,
    { provide: OPENROUTER_FETCH, useValue: globalThis.fetch },
    { provide: GROQ_FETCH, useValue: globalThis.fetch },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
