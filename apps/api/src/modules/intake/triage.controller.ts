import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IntakeService } from "./intake.service";
import { BearerAuthGuard } from "./guards/bearer-auth.guard";
import type { AuthedRequest } from "./guards/bearer-auth.guard";
import type { AcceptTriageDto, DismissTriageDto } from "./dto";

/**
 * Thao tác Triage trên IntakeItem. Tất cả đều yêu cầu Bearer JWT và
 * kiểm tra membership ở tầng service (không phải thành viên -> 404).
 */
@Controller()
export class TriageController {
  constructor(private readonly service: IntakeService) {}

  /** GET /workspaces/:workspaceId/triage?status=NEW — hàng chờ Triage, mới nhất trước. */
  @Get("workspaces/:workspaceId/triage")
  @UseGuards(BearerAuthGuard)
  list(
    @Req() req: AuthedRequest,
    @Param("workspaceId") workspaceId: string,
    @Query("status") status?: string,
  ) {
    return this.service.listTriage(req.user!.id, workspaceId, status);
  }

  /**
   * POST /triage/:itemId/accept { teamId, assigneeId?, priority? }
   * -> tạo Issue (số thứ tự tiếp theo trong team, key dạng DEV-1),
   *    gắn intakeItemId, chuyển item sang ACCEPTED. Trả Issue đã tạo.
   */
  @Post("triage/:itemId/accept")
  @UseGuards(BearerAuthGuard)
  accept(
    @Req() req: AuthedRequest,
    @Param("itemId") itemId: string,
    @Body() body: AcceptTriageDto,
  ) {
    return this.service.accept(req.user!.id, itemId, body);
  }

  /** POST /triage/:itemId/dismiss { reason? } -> chuyển item sang DISMISSED. */
  @Post("triage/:itemId/dismiss")
  @UseGuards(BearerAuthGuard)
  dismiss(
    @Req() req: AuthedRequest,
    @Param("itemId") itemId: string,
    @Body() body?: DismissTriageDto,
  ) {
    return this.service.dismiss(req.user!.id, itemId, body);
  }
}
