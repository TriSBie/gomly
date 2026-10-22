import { Module } from "@nestjs/common";
import { CaptureController } from "./capture.controller";
import { CapturePublicController } from "./capture-public.controller";
import { CaptureService } from "./capture.service";

@Module({
  controllers: [CaptureController, CapturePublicController],
  providers: [CaptureService],
  exports: [CaptureService],
})
export class CaptureModule {}
