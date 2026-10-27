import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import {
  AuthContextService,
  type AuthRequest,
} from "./auth-context.service.js";
import { readBearerToken } from "./token.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.requireUser(request);
    return true;
  }
}

/** Allows no Authorization header, but rejects a present-invalid token. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!readBearerToken(request)) return true;
    request.user = await this.auth.requireUser(request);
    return true;
  }
}
