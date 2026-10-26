import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

interface HealthPayload {
  status: "ok";
  database: "pglite" | "postgres";
  uptimeSeconds: number;
  timestamp: string;
}

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  get(): HealthPayload {
    return {
      status: "ok",
      database: this.database.driver,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
