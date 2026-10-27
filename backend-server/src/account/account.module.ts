import { Module } from "@nestjs/common";
import {
  ProviderConfigController,
  UserPreferencesController,
} from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { ProvidersModule } from "../providers/providers.module.js";

@Module({
  imports: [ProvidersModule],
  controllers: [ProviderConfigController, UserPreferencesController],
  providers: [AccountService],
})
export class AccountModule {}
