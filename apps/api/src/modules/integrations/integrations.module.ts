import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsPrismaService } from "./prisma.service";

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsPrismaService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
