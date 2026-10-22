import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Cycle, Issue } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import type {
  AttachIssueToCycleDto,
  CloseCycleDto,
  CreateCycleDto,
} from "./dto/cycles.dto";

type IssueWithTeamKey = Issue & { team?: { key: string } | null };

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  ping() {
    return { module: "cycles", status: "ok" };
  }

  async createCycle(userId: string, workspaceId: string, dto: CreateCycleDto) {
    await this.requireMembership(userId, workspaceId);
    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, workspaceId },
    });
    if (!team) {
      throw new NotFoundException("Team không tồn tại");
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException("endsAt phải sau startsAt");
    }
    let name = dto.name?.trim();
    if (!name) {
      const count = await this.prisma.cycle.count({
        where: { teamId: team.id },
      });
      name = `Cycle ${count + 1}`;
    }
    const now = new Date();
    const status = startsAt <= now && now <= endsAt ? "ACTIVE" : "UPCOMING";
    const cycle = await this.prisma.cycle.create({
      data: { workspaceId, teamId: team.id, name, startsAt, endsAt, status },
    });
    return this.withProgress(cycle, {
      totalIssues: 0,
      doneIssues: 0,
      progressPercent: 0,
    });
  }

  async listCycles(userId: string, workspaceId: string, teamId?: string) {
    await this.requireMembership(userId, workspaceId);
    const cycles = await this.prisma.cycle.findMany({
      where: { workspaceId, ...(teamId ? { teamId } : {}) },
      orderBy: { startsAt: "desc" },
    });
    return Promise.all(
      cycles.map(async (cycle) =>
        this.withProgress(cycle, await this.computeProgress(cycle.id)),
      ),
    );
  }

  async getCycle(userId: string, cycleId: string) {
    const cycle = await this.requireCycleAccess(userId, cycleId);
    const [progress, issues] = await Promise.all([
      this.computeProgress(cycle.id),
      this.prisma.issue.findMany({
        where: { cycleId: cycle.id },
        include: { team: { select: { key: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      ...this.withProgress(cycle, progress),
      issues: issues.map((issue) => this.toIssueSummary(issue)),
    };
  }

  async addIssue(userId: string, cycleId: string, dto: AttachIssueToCycleDto) {
    const cycle = await this.requireCycleAccess(userId, cycleId);
    const issue = await this.prisma.issue.findUnique({
      where: { id: dto.issueId },
    });
    // Issue phải cùng workspace với cycle — khác workspace coi như không tồn tại.
    if (!issue || issue.workspaceId !== cycle.workspaceId) {
      throw new NotFoundException("Issue không tồn tại");
    }
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: { cycleId: cycle.id },
      include: { team: { select: { key: true } } },
    });
    return this.toIssueSummary(updated);
  }

  async removeIssue(userId: string, cycleId: string, issueId: string) {
    const cycle = await this.requireCycleAccess(userId, cycleId);
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });
    if (!issue || issue.cycleId !== cycle.id) {
      throw new NotFoundException("Issue không thuộc cycle này");
    }
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: { cycleId: null },
      include: { team: { select: { key: true } } },
    });
    return this.toIssueSummary(updated);
  }

  /**
   * Đóng cycle: schema Cycle không có cột closedAt → dùng status = COMPLETED.
   * Khi createNext = true: tạo cycle mới cho CÙNG team (mặc định bắt đầu đúng
   * lúc cycle cũ kết thúc, độ dài bằng cycle cũ) và lăn mọi issue chưa
   * Done/Canceled sang. Khi createNext = false: issue chưa xong GIỮ NGUYÊN
   * trong cycle đã đóng (không tự gỡ), rolledIssueIds = [].
   */
  async closeCycle(userId: string, cycleId: string, dto: CloseCycleDto) {
    const cycle = await this.requireCycleAccess(userId, cycleId);
    return this.prisma.$transaction(async (tx) => {
      const openIssues = await tx.issue.findMany({
        where: {
          cycleId: cycle.id,
          statusGroup: { notIn: ["DONE", "CANCELED"] },
        },
        select: { id: true },
      });

      let nextCycleId: string | null = null;
      const rolledIssueIds: string[] = [];

      if (dto.createNext) {
        const durationMs = cycle.endsAt.getTime() - cycle.startsAt.getTime();
        const nextStartsAt = dto.nextStartsAt
          ? new Date(dto.nextStartsAt)
          : cycle.endsAt;
        const nextEndsAt = dto.nextEndsAt
          ? new Date(dto.nextEndsAt)
          : new Date(nextStartsAt.getTime() + durationMs);
        if (nextEndsAt.getTime() <= nextStartsAt.getTime()) {
          throw new BadRequestException("nextEndsAt phải sau nextStartsAt");
        }
        const count = await tx.cycle.count({ where: { teamId: cycle.teamId } });
        const now = new Date();
        const nextCycle = await tx.cycle.create({
          data: {
            workspaceId: cycle.workspaceId,
            teamId: cycle.teamId,
            name: `Cycle ${count + 1}`,
            startsAt: nextStartsAt,
            endsAt: nextEndsAt,
            status:
              nextStartsAt <= now && now <= nextEndsAt ? "ACTIVE" : "UPCOMING",
          },
        });
        nextCycleId = nextCycle.id;
        if (openIssues.length > 0) {
          await tx.issue.updateMany({
            where: { id: { in: openIssues.map((i) => i.id) } },
            data: { cycleId: nextCycle.id },
          });
          rolledIssueIds.push(...openIssues.map((i) => i.id));
        }
      }

      await tx.cycle.update({
        where: { id: cycle.id },
        data: { status: "COMPLETED" },
      });

      return { closedCycleId: cycle.id, nextCycleId, rolledIssueIds };
    });
  }

  // ---------- Helpers ----------

  /** Lấy cycle + kiểm membership theo workspace của cycle. Non-member → 404. */
  private async requireCycleAccess(
    userId: string,
    cycleId: string,
  ): Promise<Cycle> {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
    });
    if (!cycle) {
      throw new NotFoundException("Cycle không tồn tại");
    }
    await this.requireMembership(userId, cycle.workspaceId);
    return cycle;
  }

  /**
   * Kiểm tra membership. Không phải thành viên → 404 (không phải 403):
   * không rò rỉ sự tồn tại của workspace của người khác (theo architecture.md).
   */
  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("Workspace không tồn tại");
    }
    return membership;
  }

  /** Tiến độ cycle: Done = statusGroup DONE (theo schema Issue). */
  private async computeProgress(cycleId: string) {
    const [totalIssues, doneIssues] = await Promise.all([
      this.prisma.issue.count({ where: { cycleId } }),
      this.prisma.issue.count({
        where: { cycleId, statusGroup: "DONE" },
      }),
    ]);
    return {
      totalIssues,
      doneIssues,
      progressPercent:
        totalIssues === 0 ? 0 : Math.round((doneIssues / totalIssues) * 100),
    };
  }

  private withProgress(
    cycle: Cycle,
    progress: {
      totalIssues: number;
      doneIssues: number;
      progressPercent: number;
    },
  ) {
    // Vừa gắn phẳng (totalIssues/doneIssues/progressPercent) vừa lồng `progress`
    // để client dùng kiểu nào cũng được.
    return { ...cycle, ...progress, progress };
  }

  /** Gắn `key` hiển thị (VD DEV-1) từ team.key + number — schema Issue không có cột key. */
  private toIssueSummary(issue: IssueWithTeamKey) {
    const { team, ...rest } = issue;
    return {
      ...rest,
      key: team?.key ? `${team.key}-${issue.number}` : null,
    };
  }
}
