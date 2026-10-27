import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type {
  DashboardData,
  DashboardQuery,
} from "@sda/contracts";
import { DashboardQuerySchema } from "@sda/contracts";
import { AuthGuard } from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(
    @Req() request: AuthRequest,
    @Query(new ZodValidationPipe(DashboardQuerySchema))
    query: DashboardQuery,
  ): Promise<DashboardData> {
    return this.dashboard.get(requireUser(request).id, query.range);
  }
}
