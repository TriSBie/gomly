import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { IssuesModule } from "./modules/issues/issues.module";
import { IntakeModule } from "./modules/intake/intake.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CyclesModule } from "./modules/cycles/cycles.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { CaptureModule } from "./modules/capture/capture.module";

@Module({
  imports: [
    // Đọc DATABASE_URL / REDIS_URL / API_PORT từ .env (gốc repo hoặc apps/api)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    AuthModule,
    WorkspacesModule,
    IssuesModule,
    IntakeModule,
    IntegrationsModule,
    NotificationsModule,
    CyclesModule,
    ProjectsModule,
    WebhooksModule,
    CaptureModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
