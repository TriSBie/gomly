import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { WebhooksService } from "./webhooks.service";

type RequestWithRawBody = Request & { rawBody?: Buffer | string };

/**
 * Webhook công khai (không Bearer) — xác thực bằng chữ ký/khóa riêng của từng kênh:
 * - GitHub: HMAC-SHA256 trong header x-hub-signature-256.
 * - Slack: chữ ký v0 trong header x-slack-signature (kèm x-slack-request-timestamp).
 * - Email: khóa dùng chung trong header X-Intake-Secret (khi env INTAKE_EMAIL_SECRET có đặt).
 * - Zalo OA: MỨC KHUNG — chưa kiểm chữ ký (spike chưa xác nhận được thuật toán ký
 *   chính thức; xem cảnh báo trong WebhooksService.handleZalo).
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  /**
   * POST /webhooks/github
   *
   * LƯU Ý raw body: HMAC phải tính trên ĐÚNG bytes GitHub gửi. Nếu tiến trình bật
   * rawBody (NestFactory rawBody: true) thì req.rawBody được dùng. main.ts hiện tại
   * chưa bật rawBody nên fallback là JSON.stringify(body đã parse) — khớp với payload
   * JSON chuẩn mà GitHub gửi trong đa số trường hợp; khi bật rawBody ở main.ts,
   * đường xác thực này tự chuyển sang bytes gốc mà không cần sửa code.
   */
  @Post("github")
  @HttpCode(200)
  github(
    @Req() req: RequestWithRawBody,
    @Headers("x-github-event") event: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Headers("x-github-delivery") deliveryId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const rawBody =
      req.rawBody !== undefined && req.rawBody !== null
        ? req.rawBody.toString()
        : JSON.stringify(body ?? {});
    return this.service.handleGithub({
      event,
      signature,
      deliveryId,
      rawBody,
      payload: body ?? {},
    });
  }

  /** POST /webhooks/email — payload kiểu dịch vụ email inbound phổ biến. */
  @Post("email")
  @HttpCode(200)
  email(
    @Headers("x-intake-secret") sharedSecret: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.handleEmail({
      sharedSecret,
      payload: body ?? {},
    });
  }

  /**
   * POST /webhooks/slack — nhận cả 2 content-type của Slack:
   * - application/x-www-form-urlencoded: slash command (/gomly ...).
   * - application/json: url_verification, message_action (shortcut), Events API.
   *
   * Chữ ký v0 của Slack được tính trên ĐÚNG bytes gốc ("v0:<timestamp>:<rawBody>")
   * nên bắt buộc dùng req.rawBody (main.ts đã bật rawBody: true). Fallback khi
   * thiếu rawBody: tái tạo từ body đã parse (JSON.stringify cho JSON,
   * URLSearchParams cho form) — chỉ đúng trong trường hợp đơn giản.
   */
  @Post("slack")
  @HttpCode(200)
  slack(
    @Req() req: RequestWithRawBody,
    @Headers("x-slack-signature") signature: string | undefined,
    @Headers("x-slack-request-timestamp") timestamp: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = body ?? {};
    let rawBody: string;
    if (req.rawBody !== undefined && req.rawBody !== null) {
      rawBody = req.rawBody.toString();
    } else if (
      (req.headers["content-type"] ?? "").includes(
        "application/x-www-form-urlencoded",
      )
    ) {
      rawBody = new URLSearchParams(
        payload as Record<string, string>,
      ).toString();
    } else {
      rawBody = JSON.stringify(payload);
    }
    return this.service.handleSlack({
      signature,
      timestamp,
      rawBody,
      payload,
    });
  }

  /**
   * POST /webhooks/zalo — sự kiện Zalo OA (phương án A, mức khung chưa kiểm chứng).
   * Header x-zevent-signature được nhận vào nhưng CHƯA dùng để kiểm (spike chưa
   * xác nhận thuật toán) — service ghi log cảnh báo mỗi lần khởi động.
   */
  @Post("zalo")
  @HttpCode(200)
  zalo(
    @Headers("x-zevent-signature") signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.handleZalo({
      signature,
      payload: body ?? {},
    });
  }
}
