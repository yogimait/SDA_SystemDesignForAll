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
 * Gates project creation and run starts when REQUIRE_EMAIL_VERIFICATION=true.
 * AuthGuard/ProjectAccessGuard must run first so `request.user` is resolved.
 */
@Injectable()
export class RequireVerifiedEmailGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.REQUIRE_EMAIL_VERIFICATION) return true;
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
