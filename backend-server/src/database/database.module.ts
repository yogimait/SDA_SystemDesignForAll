import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { DrizzleProjectRepository, DrizzleRequirementsRepository } from "./repositories/drizzle-project.repository.js";
import { DrizzleRunRepository } from "./repositories/drizzle-run.repository.js";
import { DrizzleArchitectureRepository } from "./repositories/drizzle-architecture.repository.js";
import {
  PROJECT_REPOSITORY,
  REQUIREMENTS_REPOSITORY,
} from "./repositories/project.repository.js";
import { RUN_REPOSITORY } from "./repositories/run.repository.js";
import { ARCHITECTURE_REPOSITORY } from "./repositories/architecture.repository.js";

/** One global module so domain modules depend on interfaces, not on driver details. */
@Global()
@Module({
  providers: [
    DatabaseService,
    DrizzleProjectRepository,
    DrizzleRequirementsRepository,
    DrizzleRunRepository,
    DrizzleArchitectureRepository,
    { provide: PROJECT_REPOSITORY, useExisting: DrizzleProjectRepository },
    {
      provide: REQUIREMENTS_REPOSITORY,
      useExisting: DrizzleRequirementsRepository,
    },
    { provide: RUN_REPOSITORY, useExisting: DrizzleRunRepository },
    { provide: ARCHITECTURE_REPOSITORY, useExisting: DrizzleArchitectureRepository },
  ],
  exports: [
    DatabaseService,
    PROJECT_REPOSITORY,
    REQUIREMENTS_REPOSITORY,
    RUN_REPOSITORY,
    ARCHITECTURE_REPOSITORY,
  ],
})
export class DatabaseModule {}
