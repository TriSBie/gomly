import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { CaptureService } from "./capture.service";
import { SubmitCaptureDto } from "./dto";

/**
 * API CÔNG KHAI của quick-capture (không cần đăng nhập) — trang form
 * "Gửi yêu cầu" mà khách mở từ link/QR ghim trong nhóm Zalo gọi vào.
 * Token trong URL là bí mật duy nhất; link không hợp lệ/đã thu hồi -> 404.
 * Chống lạm dụng cơ bản nằm ở service: honeypot + throttle (IP, token).
 */
@Controller("capture")
export class CapturePublicController {
  constructor(private readonly service: CaptureService) {}

  /** GET /capture/:token/info — tên workspace/team để form hiển thị đúng nơi nhận. */
  @Get(":token/info")
  info(@Param("token") token: string) {
    return this.service.getPublicInfo(token);
  }

  /** POST /capture/:token — gửi yêu cầu vào Triage (kênh ZALO, source quick-capture). */
  @Post(":token")
  @HttpCode(201)
  submit(
    @Req() req: Request,
    @Param("token") token: string,
    @Body() dto: SubmitCaptureDto,
  ) {
    return this.service.submitPublic(token, req.ip ?? "unknown", dto);
  }
}
