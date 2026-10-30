import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { BILLING_PROVIDER, STRIPE_FETCH } from "./billing-provider.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { StripeBillingProvider } from "./stripe-billing.provider.js";
import { StubBillingProvider } from "./stub-billing.provider.js";

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    StubBillingProvider,
    { provide: STRIPE_FETCH, useValue: globalThis.fetch },
    {
      // Stripe when a secret key is present; the local stub otherwise.
      provide: BILLING_PROVIDER,
      inject: [APP_CONFIG, STRIPE_FETCH, StubBillingProvider],
      useFactory: (
        config: AppConfig,
        stripeFetch: typeof fetch,
        stub: StubBillingProvider,
      ) =>
        config.STRIPE_SECRET_KEY
          ? new StripeBillingProvider(config, stripeFetch)
          : stub,
    },
  ],
})
export class BillingModule {}
