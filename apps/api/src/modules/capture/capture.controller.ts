import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CaptureService } from "./capture.service";
import { CreateCaptureLinkDto } from "./dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/**
 * Quản trị capture link (quick-capture Zalo — phương án B) của 1 workspace.
 * Mọi route yêu cầu Bearer + membership (non-member -> 404).
 */
@Controller()
export class CaptureController {
  constructor(private readonly service: CaptureService) {}

  @Get("capture/ping")
  ping() {
    return this.service.ping();
  }

  /** POST /workspaces/:workspaceId/capture-links — tạo link "Gửi yêu cầu" mới. */
  @Post("workspaces/:workspaceId/capture-links")
  @UseGuards(JwtAuthGuard)
  createLink(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateCaptureLinkDto,
  ) {
    return this.service.createLink(userId, workspaceId, dto);
  }

  /**
   * GET /workspaces/:workspaceId/capture-links?revoked=true|false
   * Không truyền `revoked` -> tất cả (đã thu hồi được đánh dấu revoked=true).
   */
  @Get("workspaces/:workspaceId/capture-links")
  @UseGuards(JwtAuthGuard)
  listLinks(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("revoked") revoked?: string,
  ) {
    const filter =
      revoked === "true" ? true : revoked === "false" ? false : undefined;
    return this.service.listLinks(userId, workspaceId, filter);
  }

  /** DELETE /workspaces/:workspaceId/capture-links/:linkId — thu hồi link. */
  @Delete("workspaces/:workspaceId/capture-links/:linkId")
  @UseGuards(JwtAuthGuard)
  revokeLink(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("linkId") linkId: string,
  ) {
    return this.service.revokeLink(userId, workspaceId, linkId);
  }
}
