import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthCookieService } from "./auth-cookie.service.js";
import { AuthService } from "./auth.service.js";
import { DevOutboxController } from "./dev-outbox.controller.js";
import { EMAIL_SERVICE, OutboxEmailService } from "./email.service.js";
import { PasswordService } from "./password.service.js";
import { UsersController } from "./users.controller.js";

@Module({
  controllers: [AuthController, UsersController, DevOutboxController],
  providers: [
    AuthService,
    PasswordService,
    AuthCookieService,
    { provide: EMAIL_SERVICE, useClass: OutboxEmailService },
  ],
})
export class AuthModule {}
