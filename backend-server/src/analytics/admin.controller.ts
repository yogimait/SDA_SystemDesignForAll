import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { AdminAbuseData, AdminAbuseQuery } from "@sda/contracts";
import { AdminAbuseQuerySchema } from "@sda/contracts";
import { AdminGuard } from "../common/access/admin.guard.js";
import { AuthGuard } from "../common/access/auth.guard.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AdminAbuseService } from "./admin-abuse.service.js";

@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly abuse: AdminAbuseService) {}

  @Get("abuse")
  get(
    @Query(new ZodValidationPipe(AdminAbuseQuerySchema))
    query: AdminAbuseQuery,
  ): Promise<AdminAbuseData> {
    return this.abuse.get(query.range);
  }
}
