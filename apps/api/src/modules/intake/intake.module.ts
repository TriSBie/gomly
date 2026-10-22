import { Module } from "@nestjs/common";
import { IntakeController } from "./intake.controller";
import { TriageController } from "./triage.controller";
import { IntakeService } from "./intake.service";
import { IntakePrismaService } from "./prisma.service";
import { IntakeProcessorService } from "./intake-processor.service";
import { IntakeQueueService } from "./intake-queue.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [IntakeController, TriageController],
  providers: [
    IntakeService,
    IntakePrismaService,
    IntakeProcessorService,
    IntakeQueueService,
  ],
  exports: [IntakeService],
})
export class IntakeModule {}
