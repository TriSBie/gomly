import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Issue,
  IssueStatus,
  IssueStatusGroup,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CreateCommentDto,
  CreateIssueDto,
  UpdateIssueDto,
} from "./dto/issues.dto";

/** Ánh xạ trạng thái chi tiết -> nhóm trạng thái (statusGroup) theo schema. */
const STATUS_GROUP_BY_STATUS: Record<IssueStatus, IssueStatusGroup> = {
  BACKLOG: "BACKLOG",
  TRIAGE: "BACKLOG",
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  DONE: "DONE",
  CANCELED: "CANCELED",
};

const ISSUE_STATUSES = Object.keys(STATUS_GROUP_BY_STATUS);
const ISSUE_STATUS_GROUPS = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELED",
];

export interface ListIssuesQuery {
  teamId?: string;
  status?: string;
  statusGroup?: string;
  assigneeId?: string;
  projectId?: string;
  cycleId?: string;
  q?: string;
}

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  ping() {
    return { module: "issues", status: "ok" };
  }

  // ---------- helpers ----------

  /**
   * User không phải thành viên workspace -> 404 (không lộ sự tồn tại của
   * workspace/dữ liệu của người khác, theo kiến trúc mục 5 — giống workspaces/intake).
   */
  private async assertMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("Không tìm thấy workspace");
    }
    return membership;
  }

  /** Gắn thêm `key` hiển thị (VD DEV-12) — schema Issue không có cột key. */
  private withKey<T extends Issue>(issue: T, teamKey?: string | null) {
    return { ...issue, key: teamKey ? `${teamKey}-${issue.number}` : null };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    );
  }

  /** Nạp issue + team key, 404 nếu issue không tồn tại. */
  private async loadIssue(issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        team: { select: { id: true, key: true, name: true, workspaceId: true } },
      },
    });
    if (!issue) {
      throw new NotFoundException("Không tìm thấy issue");
    }
    return issue;
  }

  /** Nạp issue và kiểm tra quyền của user trên workspace chứa issue (non-member -> 404). */
  private async loadIssueForUser(userId: string, issueId: string) {
    const issue = await this.loadIssue(issueId);
    await this.assertMembership(userId, issue.workspaceId);
    return issue;
  }

  private async assertAssigneeMember(workspaceId: string, assigneeId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
    });
    if (!membership) {
      throw new BadRequestException("assigneeId không phải thành viên workspace");
    }
  }

  private async assertProjectInWorkspace(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new BadRequestException("projectId không thuộc workspace");
    }
  }

  private async assertCycleValid(
    workspaceId: string,
    teamId: string,
    cycleId: string,
  ) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, workspaceId },
    });
    if (!cycle) {
      throw new BadRequestException("cycleId không thuộc workspace");
    }
    if (cycle.teamId !== teamId) {
      throw new BadRequestException("cycleId không thuộc team của issue");
    }
  }

  // ---------- POST /workspaces/:workspaceId/issues ----------

  async createIssue(userId: string, workspaceId: string, dto: CreateIssueDto) {
    await this.assertMembership(userId, workspaceId);

    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, workspaceId },
    });
    if (!team) {
      throw new BadRequestException("teamId không thuộc workspace");
    }

    if (dto.assigneeId) {
      await this.assertAssigneeMember(workspaceId, dto.assigneeId);
    }
    if (dto.projectId) {
      await this.assertProjectInWorkspace(workspaceId, dto.projectId);
    }
    if (dto.cycleId) {
      await this.assertCycleValid(workspaceId, team.id, dto.cycleId);
    }

    const status: IssueStatus = dto.status ?? "BACKLOG";

    // Cấp số issue theo team: transaction (đọc max number -> tạo), retry khi đụng
    // @@unique([teamId, number]) — cùng mẫu với triage accept của module intake.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const issue = await this.prisma.$transaction(async (tx) => {
          const agg = await tx.issue.aggregate({
            where: { teamId: team.id },
            _max: { number: true },
          });
          const number = (agg._max.number ?? 0) + 1;
          return tx.issue.create({
            data: {
              workspaceId,
              teamId: team.id,
              number,
              title: dto.title.trim(),
              description: dto.description ?? null,
              status,
              statusGroup: STATUS_GROUP_BY_STATUS[status],
              priority: dto.priority ?? "NONE",
              labels: dto.labels ?? [],
              estimate: dto.estimate ?? null,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
              assigneeId: dto.assigneeId ?? null,
              creatorId: userId,
              projectId: dto.projectId ?? null,
              cycleId: dto.cycleId ?? null,
            },
          });
        });
        const created = this.withKey(issue, team.key);
        // Wave 2: báo cho người được gán (nếu gán cho người khác).
        if (dto.assigneeId && dto.assigneeId !== userId) {
          await this.notifications.createForUsers({
            workspaceId,
            actorId: userId,
            type: "ASSIGNED",
            recipientIds: [dto.assigneeId],
            issueId: issue.id,
            body: `Issue ${created.key} "${issue.title}" đã được gán cho bạn`,
          });
        }
        return created;
      } catch (error) {
        if (this.isUniqueViolation(error) && attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `Tạo issue team ${team.id}: đụng unique (teamId, number) ở lần ${attempt}, thử lại`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Không cấp được số issue, vui lòng thử lại");
  }

  // ---------- GET /workspaces/:workspaceId/issues ----------

  async listIssues(userId: string, workspaceId: string, query: ListIssuesQuery) {
    await this.assertMembership(userId, workspaceId);

    const where: Prisma.IssueWhereInput = { workspaceId };

    if (query.teamId) {
      where.teamId = query.teamId;
    }
    if (query.status) {
      const status = query.status.toUpperCase();
      if (!ISSUE_STATUSES.includes(status)) {
        throw new BadRequestException(
          `status phải thuộc: ${ISSUE_STATUSES.join(", ")}`,
        );
      }
      where.status = status as IssueStatus;
    }
    if (query.statusGroup) {
      const group = query.statusGroup.toUpperCase();
      if (!ISSUE_STATUS_GROUPS.includes(group)) {
        throw new BadRequestException(
          `statusGroup phải thuộc: ${ISSUE_STATUS_GROUPS.join(", ")}`,
        );
      }
      where.statusGroup = group as IssueStatusGroup;
    }
    if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.cycleId) {
      where.cycleId = query.cycleId;
    }
    if (query.q && query.q.trim().length > 0) {
      const q = query.q.trim();
      const or: Prisma.IssueWhereInput[] = [
        { title: { contains: q, mode: "insensitive" } },
      ];
      // q dạng mã issue (VD "DEV-12") -> khớp chính xác team.key + number.
      const keyMatch = /^([A-Za-z0-9]+)-(\d+)$/.exec(q);
      if (keyMatch) {
        const team = await this.prisma.team.findFirst({
          where: { workspaceId, key: keyMatch[1].toUpperCase() },
          select: { id: true },
        });
        if (team) {
          or.push({ teamId: team.id, number: parseInt(keyMatch[2], 10) });
        }
      }
      where.OR = or;
    }

    const issues = await this.prisma.issue.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        team: { select: { id: true, key: true, name: true } },
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        project: { select: { id: true, name: true, status: true } },
        cycle: { select: { id: true, name: true, status: true } },
      },
    });

    return issues.map(({ team, ...issue }) =>
      this.withKey(issue as Issue, team?.key),
    );
  }

  // ---------- GET /issues/:issueId ----------

  async getIssue(userId: string, issueId: string) {
    const issue = await this.loadIssueForUser(userId, issueId);
    const detail = await this.prisma.issue.findUnique({
      where: { id: issue.id },
      include: {
        team: { select: { id: true, key: true, name: true, workspaceId: true } },
        workspace: { select: { id: true, name: true, slug: true } },
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        creator: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        project: true,
        cycle: true,
        intakeItem: {
          select: {
            id: true,
            channel: true,
            triageStatus: true,
            senderName: true,
            externalUrl: true,
          },
        },
      },
    });
    // detail chắc chắn tồn tại vì loadIssueForUser vừa nạp thành công.
    const { team, ...rest } = detail!;
    return { ...this.withKey(rest as unknown as Issue, team?.key), team };
  }

  // ---------- PATCH /issues/:issueId ----------

  async updateIssue(userId: string, issueId: string, dto: UpdateIssueDto) {
    const issue = await this.loadIssueForUser(userId, issueId);

    const data: Prisma.IssueUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      // Đồng bộ nhóm trạng thái theo trạng thái chi tiết.
      data.statusGroup = STATUS_GROUP_BY_STATUS[dto.status];
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }
    if (dto.labels !== undefined) {
      data.labels = dto.labels;
    }
    if (dto.estimate !== undefined) {
      data.estimate = dto.estimate;
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        await this.assertAssigneeMember(issue.workspaceId, dto.assigneeId);
      }
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.projectId !== undefined) {
      if (dto.projectId) {
        await this.assertProjectInWorkspace(issue.workspaceId, dto.projectId);
      }
      data.project = dto.projectId
        ? { connect: { id: dto.projectId } }
        : { disconnect: true };
    }
    if (dto.cycleId !== undefined) {
      if (dto.cycleId) {
        await this.assertCycleValid(issue.workspaceId, issue.teamId, dto.cycleId);
      }
      data.cycle = dto.cycleId
        ? { connect: { id: dto.cycleId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data,
      include: { team: { select: { id: true, key: true, name: true } } },
    });
    const { team, ...rest } = updated;
    const result = this.withKey(rest as Issue, team?.key);

    // Wave 2: phát thông báo cho các thay đổi quan trọng (không tự báo cho
    // người vừa thao tác — createForUsers tự loại actor).
    if (dto.assigneeId && dto.assigneeId !== issue.assigneeId) {
      await this.notifications.createForUsers({
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "ASSIGNED",
        recipientIds: [dto.assigneeId],
        issueId: issue.id,
        body: `Issue ${result.key} "${updated.title}" đã được gán cho bạn`,
      });
    }
    if (dto.status !== undefined && dto.status !== issue.status) {
      await this.notifications.createForUsers({
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "STATUS_CHANGED",
        recipientIds: [updated.assigneeId, issue.creatorId],
        issueId: issue.id,
        body: `Issue ${result.key} chuyển trạng thái ${issue.status} → ${dto.status}: ${updated.title}`,
      });
    }
    return result;
  }

  // ---------- DELETE /issues/:issueId ----------

  async deleteIssue(userId: string, issueId: string) {
    const issue = await this.loadIssueForUser(userId, issueId);
    // Schema Issue chưa có cột deletedAt -> XÓA CỨNG.
    // Comment con bị xóa theo (onDelete: Cascade trong schema), Notification
    // liên kết được SetNull. Xem ghi chú trong báo cáo/README.
    await this.prisma.issue.delete({ where: { id: issue.id } });
    return { deleted: true, id: issue.id };
  }

  // ---------- Comments ----------

  async listComments(userId: string, issueId: string) {
    const issue = await this.loadIssueForUser(userId, issueId);
    const comments = await this.prisma.comment.findMany({
      where: { issueId: issue.id },
      orderBy: [{ createdAt: "asc" }],
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    // Hợp đồng API dùng tên trường `content`; cột DB là `body` -> trả kèm cả hai.
    return comments.map((c) => ({ ...c, content: c.body }));
  }

  async createComment(userId: string, issueId: string, dto: CreateCommentDto) {
    const issue = await this.loadIssueForUser(userId, issueId);
    const comment = await this.prisma.comment.create({
      data: {
        workspaceId: issue.workspaceId,
        issueId: issue.id,
        authorId: userId,
        body: dto.content,
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Wave 2: báo bình luận mới cho creator + assignee, và báo riêng cho
    // người được nhắc tên (@email chính xác / @tên best-effort — xem
    // NotificationsService.findMentionedUserIds). Người bình luận không tự nhận.
    const issueKey = issue.team?.key
      ? `${issue.team.key}-${issue.number}`
      : "issue";
    const excerpt =
      dto.content.length > 120 ? `${dto.content.slice(0, 120)}…` : dto.content;
    await this.notifications.createForUsers({
      workspaceId: issue.workspaceId,
      actorId: userId,
      type: "COMMENTED",
      recipientIds: [issue.creatorId, issue.assigneeId],
      issueId: issue.id,
      body: `Bình luận mới trên ${issueKey}: ${excerpt}`,
    });
    const mentionedIds = await this.notifications.findMentionedUserIds(
      issue.workspaceId,
      dto.content,
      userId,
    );
    if (mentionedIds.length > 0) {
      await this.notifications.createForUsers({
        workspaceId: issue.workspaceId,
        actorId: userId,
        type: "MENTIONED",
        recipientIds: mentionedIds,
        issueId: issue.id,
        body: `Bạn được nhắc trong bình luận trên ${issueKey}: ${excerpt}`,
      });
    }
    return { ...comment, content: comment.body };
  }
}
