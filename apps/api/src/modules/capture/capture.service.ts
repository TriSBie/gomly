import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { CaptureLink, Team, Workspace } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import type { CreateCaptureLinkDto, SubmitCaptureDto } from "./dto";

/** Giới hạn gửi công khai: tối đa 10 lần/phút cho mỗi cặp (IP, token). */
const THROTTLE_LIMIT = 10;
const THROTTLE_WINDOW_MS = 60_000;

/** Bản ghi hiển thị của 1 capture link (kèm đường dẫn công khai + cờ đã thu hồi). */
export interface CaptureLinkView {
  id: string;
  workspaceId: string;
  teamId: string | null;
  token: string;
  path: string;
  label: string | null;
  createdById: string | null;
  revokedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);
  /** Throttle in-memory (đủ cho MVP 1 tiến trình): key "<ip>|<token>" -> mốc thời gian các lần gửi. */
  private readonly submitLog = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  ping() {
    return { module: "capture", status: "ok", mode: "zalo-quick-capture" };
  }

  // ---------- Phần quản trị (Bearer + membership, non-member -> 404) ----------

  private async assertMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("Không tìm thấy workspace");
    }
    return membership;
  }

  private toView(link: CaptureLink): CaptureLinkView {
    return {
      id: link.id,
      workspaceId: link.workspaceId,
      teamId: link.teamId,
      token: link.token,
      path: `/capture/${link.token}`,
      label: link.label,
      createdById: link.createdById,
      revokedAt: link.revokedAt,
      revoked: link.revokedAt !== null,
      createdAt: link.createdAt,
    };
  }

  /**
   * POST /workspaces/:workspaceId/capture-links
   * Tạo link "Gửi yêu cầu" với token ngẫu nhiên 32 ký tự (randomBytes 24 byte, base64url).
   */
  async createLink(
    userId: string,
    workspaceId: string,
    dto: CreateCaptureLinkDto,
  ): Promise<CaptureLinkView> {
    await this.assertMembership(userId, workspaceId);

    let teamId: string | null = null;
    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, workspaceId },
        select: { id: true },
      });
      if (!team) {
        throw new BadRequestException(
          "teamId không thuộc workspace này",
        );
      }
      teamId = team.id;
    }

    // Token đụng nhau gần như không thể (192 bit entropy) nhưng vẫn thử lại vài lần cho chắc.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(24).toString("base64url");
      try {
        const link = await this.prisma.captureLink.create({
          data: {
            workspaceId,
            teamId,
            token,
            label: dto.label?.trim() || null,
            createdById: userId,
          },
        });
        this.logger.log(
          `Đã tạo capture link ${link.id} cho workspace ${workspaceId} (team=${teamId ?? "không gán"})`,
        );
        return this.toView(link);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "P2002" &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException("Không tạo được capture link, thử lại sau");
  }

  /**
   * GET /workspaces/:workspaceId/capture-links?revoked=true|false
   * Mặc định trả TẤT CẢ link (mới nhất trước), link đã thu hồi có revoked=true + revokedAt.
   * revoked=false -> chỉ link đang hiệu lực; revoked=true -> chỉ link đã thu hồi.
   */
  async listLinks(
    userId: string,
    workspaceId: string,
    revokedFilter?: boolean,
  ): Promise<CaptureLinkView[]> {
    await this.assertMembership(userId, workspaceId);
    const links = await this.prisma.captureLink.findMany({
      where: {
        workspaceId,
        ...(revokedFilter === true
          ? { revokedAt: { not: null } }
          : revokedFilter === false
            ? { revokedAt: null }
            : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return links.map((link) => this.toView(link));
  }

  /** DELETE /workspaces/:workspaceId/capture-links/:linkId — thu hồi (revokedAt = now). Thu hồi lại là vô hại. */
  async revokeLink(
    userId: string,
    workspaceId: string,
    linkId: string,
  ): Promise<CaptureLinkView> {
    await this.assertMembership(userId, workspaceId);
    const link = await this.prisma.captureLink.findFirst({
      where: { id: linkId, workspaceId },
    });
    if (!link) {
      throw new NotFoundException("Không tìm thấy capture link");
    }
    if (link.revokedAt) {
      return this.toView(link);
    }
    const updated = await this.prisma.captureLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    this.logger.log(
      `Đã thu hồi capture link ${link.id} của workspace ${workspaceId}`,
    );
    return this.toView(updated);
  }

  // ---------- Phần công khai (không cần đăng nhập) ----------

  /** Tìm link theo token; không tồn tại hoặc đã thu hồi -> 404. */
  private async findActiveLink(
    token: string,
  ): Promise<CaptureLink & { workspace: Workspace; team: Team | null }> {
    const link = await this.prisma.captureLink.findUnique({
      where: { token },
      include: { workspace: true, team: true },
    });
    if (!link || link.revokedAt) {
      throw new NotFoundException(
        "Link gửi yêu cầu không hợp lệ hoặc đã bị thu hồi",
      );
    }
    return link;
  }

  /** GET /capture/:token/info — thông tin tối thiểu để trang form hiển thị đúng nơi nhận. */
  async getPublicInfo(token: string) {
    const link = await this.findActiveLink(token);
    return {
      workspaceName: link.workspace.name,
      teamName: link.team?.name ?? null,
    };
  }

  /**
   * POST /capture/:token — tạo IntakeItem kênh ZALO vào Triage của workspace.
   * rawPayload.source = "quick-capture": yêu cầu này do khách/thành viên gửi qua
   * link "Gửi yêu cầu" ghim trong nhóm Zalo (phương án B của spike Zalo — không
   * phải tin nhắn OA). Chống lạm dụng mức cơ bản: honeypot `website` + throttle
   * in-memory theo (IP, token).
   */
  async submitPublic(token: string, ip: string, dto: SubmitCaptureDto) {
    const link = await this.findActiveLink(token);

    // Honeypot: form thật không có trường `website` — bot điền vào thì trả 201 giả,
    // KHÔNG tạo item và không để lộ là đã bị phát hiện.
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.warn(
        `Capture submit trúng honeypot (link ${link.id}, ip ${ip}) — trả 201 giả, không tạo item`,
      );
      return { ok: true };
    }

    this.assertWithinThrottle(ip, token);

    const item = await this.prisma.intakeItem.create({
      data: {
        workspaceId: link.workspaceId,
        teamId: link.teamId,
        channel: "ZALO",
        triageStatus: "NEW",
        title: dto.title.trim(),
        content: dto.content.trim(),
        senderName: dto.senderName.trim(),
        senderRef: null,
        rawPayload: {
          source: "quick-capture",
          note: "Yêu cầu gửi qua link quick-capture ghim trong nhóm Zalo (không qua OA)",
          captureLinkId: link.id,
          captureLinkLabel: link.label,
        },
      },
    });
    this.logger.log(
      `Quick-capture (link ${link.id}) -> IntakeItem ZALO ${item.id} trong workspace ${link.workspaceId}`,
    );
    return { ok: true };
  }

  /** Throttle trượt 60 giây theo (IP, token); vượt giới hạn -> 429. */
  private assertWithinThrottle(ip: string, token: string) {
    const key = `${ip}|${token}`;
    const now = Date.now();
    const hits = (this.submitLog.get(key) ?? []).filter(
      (t) => now - t < THROTTLE_WINDOW_MS,
    );
    if (hits.length >= THROTTLE_LIMIT) {
      this.submitLog.set(key, hits);
      throw new HttpException(
        "Bạn gửi quá nhiều yêu cầu trong thời gian ngắn — vui lòng thử lại sau ít phút",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    hits.push(now);
    this.submitLog.set(key, hits);
  }
}
