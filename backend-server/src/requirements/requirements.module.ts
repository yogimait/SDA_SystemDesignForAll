import { Module } from "@nestjs/common";
import { GenerationModule } from "../generation/generation.module.js";
import { RequirementsController } from "./requirements.controller.js";
import { RequirementsService } from "./requirements.service.js";

@Module({
  imports: [GenerationModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
