import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { DrizzleProjectRepository, DrizzleRequirementsRepository } from "./repositories/drizzle-project.repository.js";
import { DrizzleRunRepository } from "./repositories/drizzle-run.repository.js";
import { DrizzleArchitectureRepository } from "./repositories/drizzle-architecture.repository.js";
import { DrizzleUserRepository } from "./repositories/drizzle-user.repository.js";
import { DrizzleSessionRepository } from "./repositories/drizzle-session.repository.js";
import { DrizzleAccountRepository } from "./repositories/drizzle-account.repository.js";
import { DrizzleAnalyticsRepository } from "./repositories/drizzle-analytics.repository.js";
import {
  PROJECT_REPOSITORY,
  REQUIREMENTS_REPOSITORY,
} from "./repositories/project.repository.js";
import { RUN_REPOSITORY } from "./repositories/run.repository.js";
import { ARCHITECTURE_REPOSITORY } from "./repositories/architecture.repository.js";
import { USER_REPOSITORY } from "./repositories/user.repository.js";
import { SESSION_REPOSITORY } from "./repositories/session.repository.js";
import { ACCOUNT_REPOSITORY } from "./repositories/account.repository.js";
import { ANALYTICS_REPOSITORY } from "./repositories/analytics.repository.js";

/** One global module so domain modules depend on interfaces, not on driver details. */
@Global()
@Module({
  providers: [
    DatabaseService,
    DrizzleProjectRepository,
    DrizzleRequirementsRepository,
    DrizzleRunRepository,
    DrizzleArchitectureRepository,
    DrizzleUserRepository,
    DrizzleSessionRepository,
    DrizzleAccountRepository,
    DrizzleAnalyticsRepository,
    { provide: PROJECT_REPOSITORY, useExisting: DrizzleProjectRepository },
    {
      provide: REQUIREMENTS_REPOSITORY,
      useExisting: DrizzleRequirementsRepository,
    },
    { provide: RUN_REPOSITORY, useExisting: DrizzleRunRepository },
    { provide: ARCHITECTURE_REPOSITORY, useExisting: DrizzleArchitectureRepository },
    { provide: USER_REPOSITORY, useExisting: DrizzleUserRepository },
    { provide: SESSION_REPOSITORY, useExisting: DrizzleSessionRepository },
    { provide: ACCOUNT_REPOSITORY, useExisting: DrizzleAccountRepository },
    { provide: ANALYTICS_REPOSITORY, useExisting: DrizzleAnalyticsRepository },
  ],
  exports: [
    DatabaseService,
    PROJECT_REPOSITORY,
    REQUIREMENTS_REPOSITORY,
    RUN_REPOSITORY,
    ARCHITECTURE_REPOSITORY,
    USER_REPOSITORY,
    SESSION_REPOSITORY,
    ACCOUNT_REPOSITORY,
    ANALYTICS_REPOSITORY,
  ],
})
export class DatabaseModule {}
