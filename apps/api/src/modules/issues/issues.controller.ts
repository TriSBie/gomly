import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IssuesService } from "./issues.service";
import type { ListIssuesQuery } from "./issues.service";
import {
  CreateCommentDto,
  CreateIssueDto,
  UpdateIssueDto,
} from "./dto/issues.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/** Route lồng dưới workspace: tạo + liệt kê issue. */
@Controller("workspaces/:workspaceId/issues")
@UseGuards(JwtAuthGuard)
export class WorkspaceIssuesController {
  constructor(private readonly service: IssuesService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateIssueDto,
  ) {
    return this.service.createIssue(userId, workspaceId, dto);
  }

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListIssuesQuery,
  ) {
    return this.service.listIssues(userId, workspaceId, query);
  }
}

/** Route theo issue: chi tiết, sửa, xóa, bình luận. */
@Controller("issues")
export class IssuesController {
  constructor(private readonly service: IssuesService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  @Get(":issueId")
  @UseGuards(JwtAuthGuard)
  get(@CurrentUserId() userId: string, @Param("issueId") issueId: string) {
    return this.service.getIssue(userId, issueId);
  }

  @Patch(":issueId")
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUserId() userId: string,
    @Param("issueId") issueId: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.service.updateIssue(userId, issueId, dto);
  }

  @Delete(":issueId")
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUserId() userId: string, @Param("issueId") issueId: string) {
    return this.service.deleteIssue(userId, issueId);
  }

  @Get(":issueId/comments")
  @UseGuards(JwtAuthGuard)
  listComments(
    @CurrentUserId() userId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.service.listComments(userId, issueId);
  }

  @Post(":issueId/comments")
  @UseGuards(JwtAuthGuard)
  createComment(
    @CurrentUserId() userId: string,
    @Param("issueId") issueId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.service.createComment(userId, issueId, dto);
  }
}
