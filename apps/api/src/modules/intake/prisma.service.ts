import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient riêng của module intake.
 *
 * Cố ý KHÔNG $connect() lúc khởi tạo module: Prisma kết nối lười ở truy vấn đầu tiên,
 * nên API vẫn boot được khi DB chưa sẵn sàng (khớp cách bản khung chạy /health
 * không cần DB). Không dùng client từ module khác để module intake độc lập,
 * đúng yêu cầu "dùng Prisma trực tiếp, không phụ thuộc code của module workspaces".
 */
@Injectable()
export class IntakePrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ log: ["error"] });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
