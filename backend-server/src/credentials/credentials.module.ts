import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProvidersModule } from "../providers/providers.module.js";
import { CredentialCryptoService } from "./credential-crypto.service.js";
import { ProviderCredentialsController } from "./credentials.controller.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  imports: [ProvidersModule, AuthModule],
  controllers: [ProviderCredentialsController],
  providers: [CredentialCryptoService, CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
