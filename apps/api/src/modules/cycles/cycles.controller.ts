import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CyclesService } from "./cycles.service";
import {
  AttachIssueToCycleDto,
  CloseCycleDto,
  CreateCycleDto,
} from "./dto/cycles.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUserId } from "../../common/decorators/current-user.decorator";

/** Route lồng dưới workspace: /workspaces/:workspaceId/cycles */
@Controller("workspaces/:workspaceId/cycles")
@UseGuards(JwtAuthGuard)
export class CyclesController {
  constructor(private readonly service: CyclesService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateCycleDto,
  ) {
    return this.service.createCycle(userId, workspaceId, dto);
  }

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.service.listCycles(userId, workspaceId, teamId);
  }
}

/** Route theo cycle: /cycles/:cycleId... */
@Controller("cycles")
@UseGuards(JwtAuthGuard)
export class CycleController {
  constructor(private readonly service: CyclesService) {}

  @Get("ping")
  ping() {
    return this.service.ping();
  }

  @Get(":cycleId")
  get(@CurrentUserId() userId: string, @Param("cycleId") cycleId: string) {
    return this.service.getCycle(userId, cycleId);
  }

  @Post(":cycleId/issues")
  addIssue(
    @CurrentUserId() userId: string,
    @Param("cycleId") cycleId: string,
    @Body() dto: AttachIssueToCycleDto,
  ) {
    return this.service.addIssue(userId, cycleId, dto);
  }

  @Delete(":cycleId/issues/:issueId")
  removeIssue(
    @CurrentUserId() userId: string,
    @Param("cycleId") cycleId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.service.removeIssue(userId, cycleId, issueId);
  }

  @Post(":cycleId/close")
  close(
    @CurrentUserId() userId: string,
    @Param("cycleId") cycleId: string,
    @Body() dto: CloseCycleDto,
  ) {
    return this.service.closeCycle(userId, cycleId, dto);
  }
}
