import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module.js";
import { ArchitectureGenerator } from "./architecture.generator.js";
import { GenerationWorker } from "./generation.worker.js";
import { RequirementsGenerator } from "./requirements.generator.js";
import { RunController } from "./run.controller.js";
import { RunEventsService } from "./run-events.service.js";
import { RunService } from "./run.service.js";

@Module({
  imports: [ProvidersModule],
  controllers: [RunController],
  providers: [
    RequirementsGenerator,
    ArchitectureGenerator,
    GenerationWorker,
    RunEventsService,
    RunService,
  ],
  exports: [RunService, RunEventsService],
})
export class GenerationModule {}
