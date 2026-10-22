import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { MeController } from "./me.controller";
import { NotificationsService } from "./notifications.service";
import { PrismaModule } from "../../common/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController, MeController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
