import { Injectable, Logger } from "@nestjs/common";
import { IntakeProcessorService } from "./intake-processor.service";

/**
 * Điểm gắn hàng đợi intake (kiến trúc mục 4 chốt BullMQ + Redis, queue "intake").
 *
 * TRẠNG THÁI HIỆN TẠI — FALLBACK ĐỒNG BỘ:
 * Môi trường hiện chưa có Redis (localhost:6379 chưa chạy) và package `bullmq`
 * chưa được cài, nên enqueueNormalization() xử lý ĐỒNG BỘ ngay trong request
 * bằng cách gọi thẳng processor. Lỗi ở bước này được nuốt ở tầng gọi (service)
 * để API không bao giờ sập vì khâu chuẩn hóa.
 *
 * KHI CÓ REDIS + BULLMQ — chỉ thay thân hàm dưới đây:
 *   1. Cài bullmq (+ ioredis) cho @gomly/api, tạo Queue("intake", { connection }).
 *   2. enqueueNormalization -> queue.add("normalize", { intakeItemId },
 *        { jobId: `intake-${intakeItemId}` })  // jobId = lớp idempotency ở tầng queue.
 *   3. Đăng ký Worker("intake", job => processor.processNormalization(job.data.intakeItemId))
 *      trong IntakeModule (chạy cùng tiến trình API ở MVP theo kiến trúc).
 * Logic nghiệp vụ không đổi vì worker gọi đúng processor hiện tại.
 */
@Injectable()
export class IntakeQueueService {
  private readonly logger = new Logger(IntakeQueueService.name);

  constructor(private readonly processor: IntakeProcessorService) {
    const redisUrl = process.env.REDIS_URL;
    this.logger.log(
      redisUrl
        ? `Intake queue: chế độ đồng bộ (fallback) — REDIS_URL đã đặt (${redisUrl}) nhưng bullmq chưa được gắn; xem comment trong intake-queue.service.ts`
        : "Intake queue: chế độ đồng bộ (fallback) — chưa có REDIS_URL/Redis",
    );
  }

  async enqueueNormalization(intakeItemId: string): Promise<void> {
    await this.processor.processNormalization(intakeItemId);
  }
}
