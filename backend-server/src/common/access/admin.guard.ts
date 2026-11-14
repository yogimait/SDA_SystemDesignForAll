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
 * Ops surfaces are gated by an explicit email allowlist. AuthGuard must run
 * first so `request.user` is resolved; an empty ADMIN_EMAILS closes the route.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const email = request.user?.email.trim().toLowerCase();
    if (!email || !this.config.ADMIN_EMAILS.includes(email)) {
      throw new AppError(
        "ADMIN_ACCESS_DENIED",
        "Admin access is required for this operation.",
        { reason: "admin_email_required" },
      );
    }
    return true;
  }
}
