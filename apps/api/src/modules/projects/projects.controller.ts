import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import {
  AttachIssueToProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
} from "./dto/projects.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/** Route lồng dưới workspace: /workspaces/:workspaceId/projects */
@Controller("workspaces/:workspaceId/projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.service.createProject(userId, workspaceId, dto);
  }

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.service.listProjects(userId, workspaceId);
  }
}

/** Route theo project: /projects/:projectId... */
@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly service: ProjectsService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  @Get(":projectId")
  get(
    @CurrentUserId() userId: string,
    @Param("projectId") projectId: string,
  ) {
    return this.service.getProject(userId, projectId);
  }

  @Patch(":projectId")
  update(
    @CurrentUserId() userId: string,
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.service.updateProject(userId, projectId, dto);
  }

  @Post(":projectId/issues")
  addIssue(
    @CurrentUserId() userId: string,
    @Param("projectId") projectId: string,
    @Body() dto: AttachIssueToProjectDto,
  ) {
    return this.service.addIssue(userId, projectId, dto);
  }

  @Delete(":projectId/issues/:issueId")
  removeIssue(
    @CurrentUserId() userId: string,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.service.removeIssue(userId, projectId, issueId);
  }
}
