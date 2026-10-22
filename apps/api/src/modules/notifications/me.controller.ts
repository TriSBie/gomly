import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/** Route "của tôi": hiện tại là My Issues (việc được gán cho chính mình). */
@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly service: NotificationsService) {}

  @Get("issues")
  myIssues(
    @CurrentUserId() userId: string,
    @Query("statusGroup") statusGroup?: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.service.listMyIssues(userId, { statusGroup, workspaceId });
  }
}
