import { Global, Module } from "@nestjs/common";
import { AccessKeyService } from "./access/access-key.service.js";
import { AuthContextService } from "./access/auth-context.service.js";
import { AuthGuard, OptionalAuthGuard } from "./access/auth.guard.js";
import { ProjectAccessGuard } from "./access/project-access.guard.js";
import { PlanService } from "../plans/plan.service.js";

@Global()
@Module({
  providers: [
    AccessKeyService,
    AuthContextService,
    AuthGuard,
    OptionalAuthGuard,
    ProjectAccessGuard,
    PlanService,
  ],
  exports: [
    AccessKeyService,
    AuthContextService,
    AuthGuard,
    OptionalAuthGuard,
    ProjectAccessGuard,
    PlanService,
  ],
})
export class CommonModule {}
