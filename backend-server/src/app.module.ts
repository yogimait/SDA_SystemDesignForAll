import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ArchitectureModule } from "./architecture/architecture.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccountModule } from "./account/account.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { CommonModule } from "./common/common.module.js";
import { ApiResponseInterceptor } from "./common/envelope/api-response.interceptor.js";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter.js";
import { ConfigModule } from "./config/config.module.js";
import { APP_CONFIG } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { GenerationModule } from "./generation/generation.module.js";
import { HealthController } from "./health/health.controller.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { ProvidersModule } from "./providers/providers.module.js";
import { RequirementsModule } from "./requirements/requirements.module.js";

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            ttl: config.THROTTLE_TTL_MS,
            limit: config.THROTTLE_LIMIT,
          },
        ],
      }),
    }),
    ProvidersModule,
    GenerationModule,
    ProjectsModule,
    RequirementsModule,
    ArchitectureModule,
    AuthModule,
    AccountModule,
    AnalyticsModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
