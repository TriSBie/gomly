import { Module } from "@nestjs/common";
import { CycleController, CyclesController } from "./cycles.controller";
import { CyclesService } from "./cycles.service";
import { PrismaModule } from "../../common/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [CyclesController, CycleController],
  providers: [CyclesService],
  exports: [CyclesService],
})
export class CyclesModule {}
