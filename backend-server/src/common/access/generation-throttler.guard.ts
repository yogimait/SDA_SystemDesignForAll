import { type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
  type ThrottlerStorage,
  getOptionsToken,
  getStorageToken,
} from "@nestjs/throttler";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";

/**
 * Run-start budget. ProjectAccessGuard has already resolved the owner, so a
 * logged-in user is tracked by account instead of by shared NAT address.
 * Anonymous/project-key-only legacy requests fall back to the IP tracker.
 */
@Injectable()
export class GenerationThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    this.throttlers = [
      {
        name: "generation",
        limit: this.config.GENERATION_THROTTLE_LIMIT,
        ttl: this.config.GENERATION_THROTTLE_TTL_MS,
      },
    ] satisfies ThrottlerOptions[];
    this.commonOptions = {
      getTracker: this.getTracker.bind(this),
      generateKey: this.generateKey.bind(this),
    };
    return super.canActivate(context);
  }

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = (req as { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    return super.getTracker(req);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const seconds = Math.max(
      1,
      Math.ceil(detail.timeToBlockExpire || detail.timeToExpire),
    );
    this.setResponseHeader(res, "Retry-After", seconds);
    return super.throwThrottlingException(context, detail);
  }
}
