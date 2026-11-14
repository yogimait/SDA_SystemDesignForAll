import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";
import type { AuthRequest } from "./auth-context.service.js";

/**
 * Gates project creation and run starts when verification is required.
 * Production always enforces this regardless of the legacy env flag so a
 * stale `REQUIRE_EMAIL_VERIFICATION=0` cannot expose hosted generation.
 * AuthGuard/ProjectAccessGuard must run first so `request.user` is resolved.
 */
@Injectable()
export class RequireVerifiedEmailGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.config.NODE_ENV === "production" ||
      this.config.REQUIRE_EMAIL_VERIFICATION;
    if (!required) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.user && !request.user.emailVerifiedAt) {
      throw new AppError(
        "AUTH_REQUIRED",
        "Verify your email address before starting generation.",
        { reason: "email_not_verified" },
      );
    }
    return true;
  }
}
