import { Global, Module } from "@nestjs/common";
import { AccessKeyService } from "./access/access-key.service.js";
import { AdminGuard } from "./access/admin.guard.js";
import { AuthContextService } from "./access/auth-context.service.js";
import { AuthGuard, OptionalAuthGuard } from "./access/auth.guard.js";
import { GenerationThrottlerGuard } from "./access/generation-throttler.guard.js";
import { ProjectAccessGuard } from "./access/project-access.guard.js";
import { RequireVerifiedEmailGuard } from "./access/verified-email.guard.js";
import { SignupThrottlerGuard } from "./access/signup-throttler.guard.js";
import { PlanService } from "../plans/plan.service.js";

@Global()
@Module({
  providers: [
    AccessKeyService,
    AuthContextService,
    AuthGuard,
    OptionalAuthGuard,
    ProjectAccessGuard,
    RequireVerifiedEmailGuard,
    SignupThrottlerGuard,
    GenerationThrottlerGuard,
    AdminGuard,
    PlanService,
  ],
  exports: [
    AccessKeyService,
    AuthContextService,
    AuthGuard,
    OptionalAuthGuard,
    ProjectAccessGuard,
    RequireVerifiedEmailGuard,
    SignupThrottlerGuard,
    GenerationThrottlerGuard,
    AdminGuard,
    PlanService,
  ],
})
export class CommonModule {}
