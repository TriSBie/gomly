import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { IntakeService } from "./intake.service";
import { BearerAuthGuard } from "./guards/bearer-auth.guard";
import type { AuthedRequest } from "./guards/bearer-auth.guard";
import type { SimulateIntakeDto } from "./dto";

@Controller("intake")
export class IntakeController {
  constructor(private readonly service: IntakeService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  /**
   * POST /intake/simulate — tạo IntakeItem mẫu (trạng thái NEW) từ 1 kênh bất kỳ.
   * Yêu cầu Bearer JWT; user phải là thành viên workspace (không phải -> 404).
   * Có externalRef trùng (cùng workspace + kênh) -> trả item cũ (idempotent).
   */
  @Post("simulate")
  @UseGuards(BearerAuthGuard)
  simulate(@Req() req: AuthedRequest, @Body() body: SimulateIntakeDto) {
    return this.service.simulate(req.user!.id, body);
  }
}
