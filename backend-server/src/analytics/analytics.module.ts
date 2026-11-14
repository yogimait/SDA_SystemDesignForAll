import { Module } from "@nestjs/common";
import { AdminAbuseService } from "./admin-abuse.service.js";
import { AdminController } from "./admin.controller.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  controllers: [DashboardController, AdminController],
  providers: [DashboardService, AdminAbuseService],
})
export class AnalyticsModule {}
