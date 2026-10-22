import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  /** Inbox của chính tôi: mới nhất trước, lọc được chỉ-chưa-đọc. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUserId() userId: string,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listForUser(userId, {
      unreadOnly: unreadOnly === "true",
      limit: limit !== undefined ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get("unread-count")
  @UseGuards(JwtAuthGuard)
  unreadCount(@CurrentUserId() userId: string) {
    return this.service.unreadCount(userId);
  }

  /** Đánh dấu 1 thông báo đã đọc — không phải của mình -> 404. */
  @Patch(":id/read")
  @UseGuards(JwtAuthGuard)
  markRead(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.service.markRead(userId, id);
  }

  @Post("read-all")
  @UseGuards(JwtAuthGuard)
  markAllRead(@CurrentUserId() userId: string) {
    return this.service.markAllRead(userId);
  }
}
