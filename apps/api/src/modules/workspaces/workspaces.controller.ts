import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import {
  AddMemberDto,
  CreateTeamDto,
  CreateWorkspaceDto,
} from "./dto/workspaces.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateWorkspaceDto) {
    return this.service.createWorkspace(userId, dto);
  }

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.service.listWorkspaces(userId);
  }

  @Get(":id")
  get(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.service.getWorkspace(userId, id);
  }

  @Post(":id/teams")
  createTeam(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.service.createTeam(userId, id, dto);
  }

  @Get(":id/teams")
  listTeams(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.service.listTeams(userId, id);
  }

  /** GET /workspaces/:id/members — danh sách thành viên (thành viên nào cũng xem được). */
  @Get(":id/members")
  listMembers(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.service.listMembers(userId, id);
  }

  /** POST /workspaces/:id/members — thêm thành viên theo email (chỉ OWNER/ADMIN). */
  @Post(":id/members")
  addMember(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.service.addMember(userId, id, dto);
  }

  /** DELETE /workspaces/:id/members/:userId — xóa thành viên (chỉ OWNER/ADMIN; chặn xóa OWNER cuối cùng). */
  @Delete(":id/members/:userId")
  removeMember(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.service.removeMember(userId, id, targetUserId);
  }
}
