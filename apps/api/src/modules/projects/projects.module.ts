import { Module } from "@nestjs/common";
import { ProjectController, ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { PrismaModule } from "../../common/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController, ProjectController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
