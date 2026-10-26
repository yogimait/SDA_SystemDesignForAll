import { Global, Module } from "@nestjs/common";
import { AccessKeyService } from "./access/access-key.service.js";
import { ProjectAccessGuard } from "./access/project-access.guard.js";

@Global()
@Module({
  providers: [AccessKeyService, ProjectAccessGuard],
  exports: [AccessKeyService, ProjectAccessGuard],
})
export class CommonModule {}
