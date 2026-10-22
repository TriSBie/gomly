import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import {
  ConnectGithubDto,
  ConnectSlackDto,
  ConnectZaloDto,
  UpdateConnectionConfigDto,
} from "./dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/**
 * Quản lý kết nối tích hợp của 1 workspace.
 * Mọi route (trừ ping) yêu cầu Bearer <redacted> + membership (non-member -> 404).
 * Response không bao giờ chứa secret/token của kết nối — chỉ có hasSecret.
 */
@Controller()
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get("integrations/ping")
  ping() {
    return this.service.ping();
  }

  /** POST /workspaces/:workspaceId/integrations/github — nối 1 repo GitHub vào workspace. */
  @Post("workspaces/:workspaceId/integrations/github")
  @UseGuards(JwtAuthGuard)
  connectGithub(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ConnectGithubDto,
  ) {
    return this.service.connectGithub(userId, workspaceId, dto);
  }

  /** POST /workspaces/:workspaceId/integrations/slack — nối 1 Slack workspace vào workspace. */
  @Post("workspaces/:workspaceId/integrations/slack")
  @UseGuards(JwtAuthGuard)
  connectSlack(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ConnectSlackDto,
  ) {
    return this.service.connectSlack(userId, workspaceId, dto);
  }

  /** POST /workspaces/:workspaceId/integrations/zalo — nối 1 Zalo OA vào workspace (mức khung, xem service). */
  @Post("workspaces/:workspaceId/integrations/zalo")
  @UseGuards(JwtAuthGuard)
  connectZalo(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ConnectZaloDto,
  ) {
    return this.service.connectZalo(userId, workspaceId, dto);
  }

  /** PATCH /workspaces/:workspaceId/integrations/:connectionId/config — cập nhật config (VD bật/tắt bắt tin nhắn kênh Slack). */
  @Patch("workspaces/:workspaceId/integrations/:connectionId/config")
  @UseGuards(JwtAuthGuard)
  updateConnectionConfig(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("connectionId") connectionId: string,
    @Body() dto: UpdateConnectionConfigDto,
  ) {
    return this.service.updateConnectionConfig(
      userId,
      workspaceId,
      connectionId,
      dto,
    );
  }

  /** GET /workspaces/:workspaceId/integrations — danh sách kết nối (đã che secret). */
  @Get("workspaces/:workspaceId/integrations")
  @UseGuards(JwtAuthGuard)
  listConnections(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.service.listConnections(userId, workspaceId);
  }

  /** DELETE /workspaces/:workspaceId/integrations/:connectionId — ngắt 1 kết nối. */
  @Delete("workspaces/:workspaceId/integrations/:connectionId")
  @UseGuards(JwtAuthGuard)
  disconnect(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("connectionId") connectionId: string,
  ) {
    return this.service.disconnect(userId, workspaceId, connectionId);
  }

  /** GET /workspaces/:workspaceId/intake-email — địa chỉ email intake của workspace + hướng dẫn. */
  @Get("workspaces/:workspaceId/intake-email")
  @UseGuards(JwtAuthGuard)
  getIntakeEmail(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.service.getIntakeEmail(userId, workspaceId);
  }
}
