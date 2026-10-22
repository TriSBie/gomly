import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient riêng của module integrations (cùng mẫu với module intake).
 *
 * Cố ý KHÔNG $connect() lúc khởi tạo module: Prisma kết nối lười ở truy vấn đầu tiên,
 * nên API vẫn boot được khi DB chưa sẵn sàng. Module integrations/webhooks tự quản
 * vòng đời client của mình, không phụ thuộc module workspaces/auth.
 */
@Injectable()
export class IntegrationsPrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  constructor() {
    super({ log: ["error"] });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
