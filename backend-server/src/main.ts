import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap.js";
import { APP_CONFIG } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";

// Local development convenience. Shell variables win; .env is gitignored.
if (existsSync(".env")) {
  loadEnvFile(".env");
}

async function bootstrap(): Promise<void> {
  // Explicit adapter: workspace hoisting can hide the platform package from Nest's loader.
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bodyParser: false,
  });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
}

await bootstrap();
