import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "gomly-api",
      timestamp: new Date().toISOString(),
      // Chỉ báo ĐÃ CẤU HÌNH hay chưa — không lộ giá trị bí mật
      databaseConfigured: Boolean(this.config.get<string>("DATABASE_URL")),
      redisConfigured: Boolean(this.config.get<string>("REDIS_URL")),
    };
  }
}
