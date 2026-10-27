import type { INestApplication } from "@nestjs/common";
import { fail } from "@sda/contracts";
import {
  json,
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { isPayloadTooLarge } from "./common/errors/payload-too-large.js";
import { RedactingLogger } from "./common/logging/redacting.logger.js";
import { APP_CONFIG } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";

/**
 * Shared by main.ts and e2e tests so HTTP behavior cannot drift between them.
 * Body parsing is registered once here; Nest's built-in parser stays disabled.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  const origins = config.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix("api");
  const express = app.getHttpAdapter().getInstance() as Application;
  express.disable("x-powered-by");
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    next();
  });
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "authorization",
      "x-provider-api-key",
      "x-project-key",
    ],
  });
  app.useLogger(new RedactingLogger());

  app.use(json({ limit: config.MAX_REQUEST_BYTES }));
  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (isPayloadTooLarge(error)) {
        response
          .status(413)
          .json(
            fail(
              "PAYLOAD_TOO_LARGE",
              "The request body is too large.",
              { limitBytes: config.MAX_REQUEST_BYTES },
              413,
            ),
          );
        return;
      }
      next(error);
    },
  );
}
