import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  IntakeChannel,
  Issue,
  IssuePriority,
  TriageStatus,
} from "@prisma/client";
import { IntakePrismaService } from "./prisma.service";
import { IntakeQueueService } from "./intake-queue.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  INTAKE_CHANNELS,
  ISSUE_PRIORITIES,
  TRIAGE_STATUSES,
} from "./dto";
import type {
  AcceptTriageDto,
  DismissTriageDto,
  SimulateIntakeDto,
} from "./dto";

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private readonly prisma: IntakePrismaService,
    private readonly queue: IntakeQueueService,
    private readonly notifications: NotificationsService,
  ) {}

  ping() {
    return { module: "intake", status: "ok", mode: "simulate+triage" };
  }

  /**
   * Kiểm tra user có là thành viên workspace không.
   * Không phải thành viên -> 404 (không lộ sự tồn tại của workspace, theo kiến trúc mục 5).
   * Dùng Prisma trực tiếp, không phụ thuộc module workspaces.
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

  // ---------- POST /intake/simulate ----------

  async simulate(userId: string, body: SimulateIntakeDto) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Thiếu body");
    }
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!workspaceId) {
      throw new BadRequestException("Thiếu workspaceId");
    }
    const channel = typeof body.channel === "string" ? body.channel.toUpperCase() : "";
    if (!INTAKE_CHANNELS.includes(channel)) {
      throw new BadRequestException(
        `channel phải thuộc: ${INTAKE_CHANNELS.join(", ")}`,
      );
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Thiếu title");
    }

    await this.assertMembership(userId, workspaceId);

    // Idempotency: cùng workspace + kênh + externalRef -> trả item cũ, không tạo trùng.
    const externalRef =
      typeof body.externalRef === "string" && body.externalRef.trim().length > 0
        ? body.externalRef.trim()
        : undefined;
    const dedupeKey = externalRef
      ? `${channel}:${workspaceId}:${externalRef}`
      : undefined;

    if (dedupeKey) {
      const existing = await this.prisma.intakeItem.findFirst({
        where: { dedupeKey },
      });
      if (existing) {
        this.logger.log(
          `Simulate trùng (dedupeKey=${dedupeKey}) -> trả IntakeItem cũ ${existing.id}`,
        );
        return existing;
      }
    }

    const rawPayload: Prisma.InputJsonValue = {
      ...(body as unknown as Record<string, unknown>),
      simulated: true,
    };

    const item = await this.prisma.intakeItem.create({
      data: {
        workspaceId,
        channel: channel as IntakeChannel,
        triageStatus: "NEW",
        title,
        content: typeof body.content === "string" ? body.content : null,
        senderName: typeof body.senderName === "string" ? body.senderName : null,
        externalId: externalRef ?? null,
        dedupeKey: dedupeKey ?? null,
        rawPayload,
      },
    });

    // Đẩy qua "hàng đợi" chuẩn hóa — hiện là fallback đồng bộ khi chưa có Redis/BullMQ.
    // Nuốt lỗi để API không sập vì khâu chuẩn hóa (kiến trúc: nhận nhanh, xử lý sau).
    try {
      await this.queue.enqueueNormalization(item.id);
    } catch (error) {
      this.logger.error(
        `Chuẩn hóa IntakeItem ${item.id} lỗi (bỏ qua, item vẫn đã lưu): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return item;
  }

  // ---------- GET /workspaces/:workspaceId/triage ----------

  async listTriage(userId: string, workspaceId: string, statusParam?: string) {
    await this.assertMembership(userId, workspaceId);

    const status = (statusParam ?? "NEW").toUpperCase();
    if (!TRIAGE_STATUSES.includes(status as TriageStatus)) {
      throw new BadRequestException(
        `status phải thuộc: ${TRIAGE_STATUSES.join(", ")}`,
      );
    }

    return this.prisma.intakeItem.findMany({
      where: { workspaceId, triageStatus: status as TriageStatus },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      include: {
        issue: { select: { id: true, number: true, teamId: true, status: true } },
      },
    });
  }

  // ---------- POST /triage/:itemId/accept ----------

  async accept(userId: string, itemId: string, body: AcceptTriageDto) {
    const item = await this.prisma.intakeItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Không tìm thấy mục Triage");
    }
    await this.assertMembership(userId, item.workspaceId);

    if (item.triageStatus === "ACCEPTED") {
      // Accept lại là thao tác an toàn: trả issue đã tạo trước đó.
      const existing = await this.prisma.issue.findUnique({
        where: { intakeItemId: item.id },
      });
      if (existing) {
        const team = await this.prisma.team.findUnique({
          where: { id: existing.teamId },
          select: { key: true },
        });
        return this.withKey(existing, team?.key);
      }
      throw new ConflictException("Mục đã ACCEPTED nhưng không tìm thấy issue liên kết");
    }
    if (item.triageStatus !== "NEW") {
      throw new ConflictException(
        `Mục đang ở trạng thái ${item.triageStatus}, không thể accept`,
      );
    }

    if (!body || typeof body.teamId !== "string" || body.teamId.trim().length === 0) {
      throw new BadRequestException("Thiếu teamId");
    }
    const team = await this.prisma.team.findFirst({
      where: { id: body.teamId, workspaceId: item.workspaceId },
    });
    if (!team) {
      throw new BadRequestException("teamId không thuộc workspace của mục Triage");
    }

    let priority: IssuePriority = "NONE";
    if (body.priority !== undefined) {
      const candidate =
        typeof body.priority === "string" ? body.priority.toUpperCase() : "";
      if (!ISSUE_PRIORITIES.includes(candidate)) {
        throw new BadRequestException(
          `priority phải thuộc: ${ISSUE_PRIORITIES.join(", ")}`,
        );
      }
      priority = candidate as IssuePriority;
    }

    if (body.assigneeId !== undefined) {
      if (typeof body.assigneeId !== "string" || body.assigneeId.length === 0) {
        throw new BadRequestException("assigneeId không hợp lệ");
      }
      await this.assertMembership(body.assigneeId, item.workspaceId).catch(() => {
        throw new BadRequestException("assigneeId không phải thành viên workspace");
      });
    }

    // Cấp số issue: transaction (đọc max number -> tạo issue -> cập nhật item),
    // retry khi đụng @@unique([teamId, number]) do 2 accept chạy đồng thời.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const issue = await this.prisma.$transaction(async (tx) => {
          const agg = await tx.issue.aggregate({
            where: { teamId: team.id },
            _max: { number: true },
          });
          const number = (agg._max.number ?? 0) + 1;
          const created = await tx.issue.create({
            data: {
              workspaceId: item.workspaceId,
              teamId: team.id,
              number,
              title: item.title,
              description: item.content ?? undefined,
              // Trạng thái mặc định theo schema: nhóm đầu tiên (BACKLOG).
              status: "BACKLOG",
              statusGroup: "BACKLOG",
              priority,
              assigneeId: body.assigneeId ?? null,
              creatorId: userId,
              intakeItemId: item.id,
            },
          });
          await tx.intakeItem.update({
            where: { id: item.id },
            data: { triageStatus: "ACCEPTED", teamId: team.id },
          });
          return created;
        });
        const accepted = this.withKey(issue, team.key);
        // Wave 2: accept có gán người -> báo cho người được gán (trừ khi tự gán).
        // Chỉ phát khi accept tạo issue mới — accept lại (idempotent) không phát.
        if (body.assigneeId && body.assigneeId !== userId) {
          await this.notifications.createForUsers({
            workspaceId: item.workspaceId,
            actorId: userId,
            type: "ASSIGNED",
            recipientIds: [body.assigneeId],
            issueId: issue.id,
            body: `Issue ${accepted.key} "${issue.title}" đã được gán cho bạn (từ Triage)`,
          });
        }
        return accepted;
      } catch (error) {
        if (this.isUniqueViolation(error) && attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `Accept ${item.id}: đụng unique (teamId, number) ở lần ${attempt}, thử lại`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Không cấp được số issue, vui lòng thử lại");
  }

  // ---------- POST /triage/:itemId/dismiss ----------

  async dismiss(userId: string, itemId: string, body?: DismissTriageDto) {
    const item = await this.prisma.intakeItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Không tìm thấy mục Triage");
    }
    await this.assertMembership(userId, item.workspaceId);

    if (item.triageStatus === "DISMISSED") {
      return item; // dismiss lại là an toàn
    }
    if (item.triageStatus !== "NEW") {
      throw new ConflictException(
        `Mục đang ở trạng thái ${item.triageStatus}, không thể dismiss`,
      );
    }

    // Lý do dismiss được lưu vào cột dismissReason (Wave 1 đã bổ sung vào schema).
    // rawPayload vẫn là bản gốc bất biến, không ghi lý do vào đó.
    const reason =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : null;
    if (reason) {
      this.logger.log(`Dismiss IntakeItem ${item.id} — lý do: ${reason}`);
    }

    return this.prisma.intakeItem.update({
      where: { id: item.id },
      data: { triageStatus: "DISMISSED", dismissReason: reason },
    });
  }

  // ---------- helpers ----------

  /** Gắn thêm `key` hiển thị (VD DEV-1) suy ra từ team.key + number — schema Issue không có cột key. */
  private withKey(issue: Issue, teamKey?: string | null) {
    return { ...issue, key: teamKey ? `${teamKey}-${issue.number}` : null };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    );
  }
}
