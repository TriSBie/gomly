import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { NotificationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

export interface CreateNotificationsInput {
  workspaceId: string;
  /** Người thực hiện hành động — không bao giờ tự nhận thông báo của chính mình. */
  actorId: string;
  type: NotificationType;
  /** Danh sách người nhận thô (có thể chứa null/trùng/actor) — service tự lọc. */
  recipientIds: Array<string | null | undefined>;
  issueId?: string | null;
  body?: string | null;
}

const ISSUE_STATUS_GROUPS = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELED",
];

/** Bỏ dấu tiếng Việt để khớp nhắc tên dạng không dấu (best-effort). */
function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Kiểm tra `haystack` có chứa "@<needle>" với ranh giới từ hợp lệ
 * (ký tự ngay sau needle không phải chữ/số) để giảm khớp nhầm một phần tên.
 */
function containsMention(haystack: string, needle: string): boolean {
  const target = `@${needle}`;
  let idx = haystack.indexOf(target);
  while (idx !== -1) {
    const after = haystack.charAt(idx + target.length);
    if (after === "" || !/[a-z0-9]/.test(after)) {
      return true;
    }
    idx = haystack.indexOf(target, idx + 1);
  }
  return false;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  ping() {
    return { module: "notifications", status: "ok" };
  }

  // ---------- Điểm phát thông báo (dùng bởi issues/intake) ----------

  /**
   * Tạo thông báo cho nhiều người nhận trong 1 lần.
   * - Tự loại actor khỏi danh sách nhận (không tự báo cho chính mình),
   *   khử trùng + bỏ null.
   * - KHÔNG ném lỗi ra ngoài: lỗi tạo thông báo chỉ ghi log, không làm hỏng
   *   nghiệp vụ chính (tạo issue/bình luận/accept vẫn thành công).
   * Trả về số thông báo đã tạo.
   */
  async createForUsers(input: CreateNotificationsInput): Promise<number> {
    try {
      const recipientIds = [
        ...new Set(
          input.recipientIds.filter(
            (id): id is string => !!id && id !== input.actorId,
          ),
        ),
      ];
      if (recipientIds.length === 0) {
        return 0;
      }
      const result = await this.prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          workspaceId: input.workspaceId,
          userId,
          actorId: input.actorId,
          type: input.type,
          issueId: input.issueId ?? null,
          body: input.body ?? null,
        })),
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Không tạo được thông báo type=${input.type} issue=${input.issueId ?? "-"}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  /**
   * Tìm thành viên workspace được nhắc tên trong nội dung bình luận.
   * Cách khớp:
   * - Email (CHÍNH XÁC, bắt buộc có): token dạng `@<email đầy đủ>` trong nội
   *   dung, so khớp không phân biệt hoa thường với email của thành viên.
   * - Tên (BEST-EFFORT): `@<họ tên đầy đủ>` — thử cả dạng có dấu lẫn bỏ dấu
   *   tiếng Việt (VD "@Nguyễn Văn A" hoặc "@nguyen van a"), yêu cầu ranh giới
   *   từ phía sau tên để giảm khớp nhầm. Tên ngắn/trùng nhau có thể khớp nhầm,
   *   chấp nhận được ở mức best-effort; email là đường khớp đáng tin cậy.
   * Người viết bình luận (excludeUserId) không bao giờ nằm trong kết quả.
   */
  async findMentionedUserIds(
    workspaceId: string,
    content: string,
    excludeUserId: string,
  ): Promise<string[]> {
    if (!content || !content.includes("@")) {
      return [];
    }
    const memberships = await this.prisma.membership.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const emailTokens = new Set(
      [...content.matchAll(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map(
        (m) => m[1].toLowerCase(),
      ),
    );
    const lowerContent = content.toLowerCase();
    const plainContent = stripDiacritics(lowerContent);

    const mentioned: string[] = [];
    for (const membership of memberships) {
      const user = membership.user;
      if (!user || user.id === excludeUserId) {
        continue;
      }
      if (emailTokens.has(user.email.toLowerCase())) {
        mentioned.push(user.id);
        continue;
      }
      const name = user.name?.trim();
      if (!name) {
        continue;
      }
      if (
        containsMention(lowerContent, name.toLowerCase()) ||
        containsMention(plainContent, stripDiacritics(name.toLowerCase()))
      ) {
        mentioned.push(user.id);
      }
    }
    return mentioned;
  }

  // ---------- Inbox: API đọc thông báo của chính mình ----------

  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number } = {},
  ) {
    const take =
      opts.limit !== undefined && Number.isFinite(opts.limit)
        ? Math.min(Math.max(Math.trunc(opts.limit), 1), 100)
        : 50;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        issue: {
          select: {
            id: true,
            number: true,
            title: true,
            team: { select: { key: true } },
          },
        },
      },
    });
    return rows.map(({ issue, ...notification }) => {
      const issueKey = issue ? `${issue.team.key}-${issue.number}` : null;
      return {
        ...notification,
        issueKey,
        issueTitle: issue?.title ?? null,
        issue: issue
          ? { id: issue.id, key: issueKey, title: issue.title }
          : null,
      };
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      // Không phải thông báo của mình -> 404 (không lộ sự tồn tại).
      throw new NotFoundException("Không tìm thấy thông báo");
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  // ---------- My Issues ----------

  async listMyIssues(
    userId: string,
    query: { statusGroup?: string; workspaceId?: string },
  ) {
    if (query.workspaceId) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: query.workspaceId, userId },
        },
      });
      if (!membership) {
        throw new NotFoundException("Không tìm thấy workspace");
      }
    }

    const where: Prisma.IssueWhereInput = { assigneeId: userId };
    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    } else {
      // Chỉ issue thuộc các workspace mình là thành viên.
      where.workspace = { memberships: { some: { userId } } };
    }
    if (query.statusGroup) {
      const group = query.statusGroup.toUpperCase();
      if (!ISSUE_STATUS_GROUPS.includes(group)) {
        throw new BadRequestException(
          `statusGroup phải thuộc: ${ISSUE_STATUS_GROUPS.join(", ")}`,
        );
      }
      where.statusGroup = group as Prisma.IssueWhereInput["statusGroup"];
    }

    const issues = await this.prisma.issue.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        team: { select: { id: true, key: true, name: true } },
        workspace: { select: { id: true, name: true, slug: true } },
        project: { select: { id: true, name: true, status: true } },
        cycle: { select: { id: true, name: true, status: true } },
      },
    });
    return issues.map(({ team, ...issue }) => ({
      ...issue,
      key: team ? `${team.key}-${issue.number}` : null,
      team,
    }));
  }
}
