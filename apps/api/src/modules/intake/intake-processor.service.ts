import { Injectable, Logger } from "@nestjs/common";
import { IntakePrismaService } from "./prisma.service";

/**
 * Bước "chuẩn hóa" của pipeline intake (kiến trúc mục 4: nhận nhanh, xử lý sau).
 *
 * Ở bản mẫu, item tạo từ /intake/simulate đã ở dạng chuẩn hóa sẵn
 * (title / content / senderName đã tách từ body), nên processor chỉ xác nhận lại
 * item tồn tại và ghi log. Schema hiện CHƯA có cột processedAt / normalizedAt —
 * khi schema bổ sung các cột đó, cập nhật tại đúng hàm này; worker BullMQ
 * (xem IntakeQueueService) sẽ gọi hàm này y nguyên.
 */
@Injectable()
export class IntakeProcessorService {
  private readonly logger = new Logger(IntakeProcessorService.name);

  constructor(private readonly prisma: IntakePrismaService) {}

  async processNormalization(intakeItemId: string): Promise<void> {
    const item = await this.prisma.intakeItem.findUnique({
      where: { id: intakeItemId },
      select: { id: true, channel: true, triageStatus: true },
    });
    if (!item) {
      this.logger.warn(`Chuẩn hóa: không tìm thấy IntakeItem ${intakeItemId}, bỏ qua`);
      return;
    }
    this.logger.log(
      `Đã chuẩn hóa IntakeItem ${item.id} (kênh ${item.channel}, trạng thái ${item.triageStatus})`,
    );
  }
}
