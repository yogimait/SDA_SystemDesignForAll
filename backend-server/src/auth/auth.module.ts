import { Logger, Module } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { AuthController } from "./auth.controller.js";
import { AuthCookieService } from "./auth-cookie.service.js";
import { AuthService } from "./auth.service.js";
import { DevOutboxController } from "./dev-outbox.controller.js";
import {
  EMAIL_FETCH,
  EMAIL_SERVICE,
  OutboxEmailService,
  ResendEmailService,
} from "./email.service.js";
import { PasswordService } from "./password.service.js";
import { UsersController } from "./users.controller.js";

@Module({
  controllers: [AuthController, UsersController, DevOutboxController],
  providers: [
    AuthService,
    PasswordService,
    AuthCookieService,
    OutboxEmailService,
    ResendEmailService,
    { provide: EMAIL_FETCH, useValue: globalThis.fetch },
    {
      provide: EMAIL_SERVICE,
      inject: [APP_CONFIG, OutboxEmailService, ResendEmailService],
      useFactory: (
        config: AppConfig,
        outbox: OutboxEmailService,
        resend: ResendEmailService,
      ) => {
        if (config.EMAIL_PROVIDER === "resend") return resend;
        if (config.NODE_ENV === "production") {
          new Logger("AuthModule").warn(
            "EMAIL_PROVIDER=outbox in production; configure Resend before public launch.",
          );
        }
        return outbox;
      },
    },
  ],
  exports: [AuthCookieService],
})
export class AuthModule {}
