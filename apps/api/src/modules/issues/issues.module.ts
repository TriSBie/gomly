import { Module } from "@nestjs/common";
import {
  IssuesController,
  WorkspaceIssuesController,
} from "./issues.controller";
import { IssuesService } from "./issues.service";
import { PrismaModule } from "../../common/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [WorkspaceIssuesController, IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
