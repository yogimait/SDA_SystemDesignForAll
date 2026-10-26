import { Module } from "@nestjs/common";
import { GenerationModule } from "../generation/generation.module.js";
import { ArchitectureController } from "./architecture.controller.js";
import { ArchitectureService } from "./architecture.service.js";

@Module({
  imports: [GenerationModule],
  controllers: [ArchitectureController],
  providers: [ArchitectureService],
})
export class ArchitectureModule {}
