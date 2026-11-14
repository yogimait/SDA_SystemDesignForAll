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
 * Per-IP registration budget. Kept separate from login/reset so a burst of
 * signups cannot exhaust the credential budget or mint free-tier accounts.
 */
@Injectable()
export class SignupThrottlerGuard extends ThrottlerGuard {
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
        name: "signup",
        limit: this.config.SIGNUP_THROTTLE_LIMIT,
        ttl: this.config.SIGNUP_THROTTLE_TTL_MS,
      },
    ] satisfies ThrottlerOptions[];
    this.commonOptions = {
      getTracker: this.getTracker.bind(this),
      generateKey: this.generateKey.bind(this),
    };
    return super.canActivate(context);
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
