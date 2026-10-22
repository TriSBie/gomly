import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // CORS: khi WEB_ORIGIN được đặt (production) chỉ cho phép các origin đó
  // (phân tách bằng dấu phẩy); không đặt → mở cho dev local như cũ.
  const webOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (webOrigins.length > 0) {
    app.enableCors({ origin: webOrigins });
  } else {
    app.enableCors();
  }
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // Host production (Railway/Fly...) cấp cổng qua PORT; API_PORT vẫn ưu tiên cho dev.
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Gomly API đang chạy tại http://localhost:${port}`);
}

void bootstrap();
