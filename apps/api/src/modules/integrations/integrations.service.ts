import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  IntegrationConnection,
  IntakeChannel,
  IssueStatus,
  Workspace,
} from "@prisma/client";
import { IntegrationsPrismaService } from "./prisma.service";
import { decryptSecret, encryptSecret } from "./secret-crypto";
import type {
  ConnectGithubDto,
  ConnectSlackDto,
  ConnectZaloDto,
  UpdateConnectionConfigDto,
} from "./dto";

/** Miền email intake dùng trong địa chỉ intake+<slug>@<domain>. */
export const INTAKE_EMAIL_DOMAIN = "gomly.local";

/** Bản ghi hiển thị an toàn của 1 kết nối — KHÔNG chứa secret/token ở bất kỳ dạng nào. */
export interface IntegrationConnectionView {
  id: string;
  workspaceId: string;
  provider: string;
  status: string;
  externalAccountId: string | null;
  displayName: string | null;
  /** Chỉ dành cho kết nối GITHUB: suy ra từ config.repoFullName. */
  repoFullName: string | null;
  /** Chỉ dành cho kết nối SLACK: team id của Slack workspace (= externalAccountId). */
  slackTeamId: string | null;
  /**
   * Chỉ dành cho kết nối SLACK: config.captureChannelMessages — khi bật, tin nhắn
   * ở kênh Slack công khai (Events API) mới được bắt vào Triage. Mặc định tắt.
   */
  captureChannelMessages: boolean;
  /** Chỉ dành cho kết nối ZALO: OA id (= externalAccountId). */
  zaloOaId: string | null;
  /** Chỉ dành cho kết nối ZALO: app id đã khai khi kết nối (từ config.appId). */
  zaloAppId: string | null;
  /** true nếu đã có credentials được lưu (đã mã hóa) — không lộ giá trị. */
  hasSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIntakeItemInput {
  workspaceId: string;
  channel: IntakeChannel;
  title: string;
  content?: string | null;
  senderName?: string | null;
  senderRef?: string | null;
  externalId?: string | null;
  externalUrl?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly prisma: IntegrationsPrismaService) {}

  ping() {
    return { module: "integrations", status: "ok", mode: "github+slack+zalo+email-intake" };
  }

  // ---------- Kiểm tra membership (non-member -> 404, cùng mẫu module intake) ----------

  private async assertMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("Không tìm thấy workspace");
    }
    return membership;
  }

  private toView(conn: IntegrationConnection): IntegrationConnectionView {
    const config =
      conn.config && typeof conn.config === "object" && !Array.isArray(conn.config)
        ? (conn.config as Record<string, unknown>)
        : {};
    return {
      id: conn.id,
      workspaceId: conn.workspaceId,
      provider: conn.provider,
      status: conn.status,
      externalAccountId: conn.externalAccountId,
      displayName: conn.displayName,
      repoFullName:
        typeof config.repoFullName === "string" ? config.repoFullName : null,
      slackTeamId:
        conn.provider === "SLACK" ? conn.externalAccountId : null,
      captureChannelMessages:
        conn.provider === "SLACK" &&
        config.captureChannelMessages === true,
      zaloOaId: conn.provider === "ZALO" ? conn.externalAccountId : null,
      zaloAppId:
        conn.provider === "ZALO" && typeof config.appId === "string"
          ? config.appId
          : null,
      hasSecret:
        typeof conn.encryptedCredentials === "string" &&
        conn.encryptedCredentials.length > 0,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };
  }

  // ---------- Kết nối GitHub ----------

  /**
   * POST /workspaces/:workspaceId/integrations/github
   * Tạo (hoặc cập nhật nếu đã nối cùng repo) IntegrationConnection provider=GITHUB.
   * webhookSecret được mã hóa AES-256-GCM trước khi lưu (xem secret-crypto.ts),
   * response chỉ trả hasSecret=true.
   */
  async connectGithub(
    userId: string,
    workspaceId: string,
    dto: ConnectGithubDto,
  ): Promise<IntegrationConnectionView> {
    await this.assertMembership(userId, workspaceId);

    const repoFullName = dto.repoFullName.trim();
    const encryptedCredentials = encryptSecret(
      JSON.stringify({ webhookSecret: dto.webhookSecret }),
    );

    const conn = await this.prisma.integrationConnection.upsert({
      where: {
        workspaceId_provider_externalAccountId: {
          workspaceId,
          provider: "GITHUB",
          externalAccountId: repoFullName,
        },
      },
      create: {
        workspaceId,
        provider: "GITHUB",
        status: "ACTIVE",
        externalAccountId: repoFullName,
        displayName: repoFullName,
        config: { repoFullName },
        encryptedCredentials,
      },
      update: {
        status: "ACTIVE",
        displayName: repoFullName,
        config: { repoFullName },
        encryptedCredentials,
      },
    });

    this.logger.log(
      `Đã kết nối GitHub repo ${repoFullName} vào workspace ${workspaceId}`,
    );
    return this.toView(conn);
  }

  // ---------- Kết nối Slack ----------

  /**
   * POST /workspaces/:workspaceId/integrations/slack
   * Tạo (hoặc cập nhật nếu đã nối cùng Slack team) IntegrationConnection provider=SLACK,
   * externalAccountId = slackTeamId. signingSecret được mã hóa AES-256-GCM trước khi
   * lưu (cùng cơ chế GitHub), response chỉ trả hasSecret=true.
   * Cập nhật lại kết nối KHÔNG làm mất config.captureChannelMessages đã bật trước đó.
   */
  async connectSlack(
    userId: string,
    workspaceId: string,
    dto: ConnectSlackDto,
  ): Promise<IntegrationConnectionView> {
    await this.assertMembership(userId, workspaceId);

    const slackTeamId = dto.slackTeamId.trim();
    const encryptedCredentials = encryptSecret(
      JSON.stringify({ signingSecret: dto.signingSecret }),
    );

    const existing = await this.prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "SLACK", externalAccountId: slackTeamId },
    });
    const existingConfig =
      existing?.config &&
      typeof existing.config === "object" &&
      !Array.isArray(existing.config)
        ? (existing.config as Record<string, unknown>)
        : {};
    const config: Record<string, unknown> = {
      ...existingConfig,
      slackTeamId,
      captureChannelMessages:
        existingConfig.captureChannelMessages === true,
    };
    const displayName =
      dto.slackTeamName?.trim() || existing?.displayName || slackTeamId;

    const conn = await this.prisma.integrationConnection.upsert({
      where: {
        workspaceId_provider_externalAccountId: {
          workspaceId,
          provider: "SLACK",
          externalAccountId: slackTeamId,
        },
      },
      create: {
        workspaceId,
        provider: "SLACK",
        status: "ACTIVE",
        externalAccountId: slackTeamId,
        displayName,
        config: config as Prisma.InputJsonValue,
        encryptedCredentials,
      },
      update: {
        status: "ACTIVE",
        displayName,
        config: config as Prisma.InputJsonValue,
        encryptedCredentials,
      },
    });

    this.logger.log(
      `Đã kết nối Slack team ${slackTeamId} vào workspace ${workspaceId}`,
    );
    return this.toView(conn);
  }

  // ---------- Kết nối Zalo OA (phương án A — mức KHUNG) ----------

  /**
   * POST /workspaces/:workspaceId/integrations/zalo
   * Tạo (hoặc cập nhật) IntegrationConnection provider=ZALO, externalAccountId = oaId.
   * secretKey (nếu gửi) được mã hóa AES-256-GCM như các kênh khác; response chỉ
   * trả hasSecret. Cập nhật lại mà không gửi secretKey -> giữ nguyên secret đã lưu.
   *
   * LƯU Ý: đây là mức khung theo memo spike (research/zalo-api-spike.md) — CHƯA
   * kiểm chứng với Zalo thật. OA của team cần được xác thực doanh nghiệp và cấp
   * quyền OA API cho ứng dụng Gomly thì webhook mới chạy thật (rào cản hành chính,
   * không phải kỹ thuật). Đường intake Zalo dùng ngay được là quick-capture
   * (module capture), OA webhook là khung chờ đối chiếu tài liệu chính thức.
   */
  async connectZalo(
    userId: string,
    workspaceId: string,
    dto: ConnectZaloDto,
  ): Promise<IntegrationConnectionView> {
    await this.assertMembership(userId, workspaceId);

    const oaId = dto.oaId.trim();
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "ZALO", externalAccountId: oaId },
    });
    const existingConfig =
      existing?.config &&
      typeof existing.config === "object" &&
      !Array.isArray(existing.config)
        ? (existing.config as Record<string, unknown>)
        : {};
    const config: Record<string, unknown> = {
      ...existingConfig,
      oaId,
      appId: dto.appId?.trim() || (existingConfig.appId as string) || null,
    };
    // Chỉ ghi đè secret khi client gửi secretKey mới; bỏ trống = giữ nguyên.
    const encryptedCredentials = dto.secretKey
      ? encryptSecret(JSON.stringify({ secretKey: dto.secretKey }))
      : (existing?.encryptedCredentials ?? null);
    const displayName = existing?.displayName ?? `Zalo OA ${oaId}`;

    const conn = await this.prisma.integrationConnection.upsert({
      where: {
        workspaceId_provider_externalAccountId: {
          workspaceId,
          provider: "ZALO",
          externalAccountId: oaId,
        },
      },
      create: {
        workspaceId,
        provider: "ZALO",
        status: "ACTIVE",
        externalAccountId: oaId,
        displayName,
        config: config as Prisma.InputJsonValue,
        encryptedCredentials,
      },
      update: {
        status: "ACTIVE",
        displayName,
        config: config as Prisma.InputJsonValue,
        encryptedCredentials,
      },
    });

    this.logger.log(
      `Đã kết nối Zalo OA ${oaId} vào workspace ${workspaceId} (mức khung — chưa kiểm chứng với Zalo thật)`,
    );
    return this.toView(conn);
  }

  /**
   * PATCH /workspaces/:workspaceId/integrations/:connectionId/config
   * Cập nhật cấu hình của 1 kết nối (hiện dùng cho SLACK: captureChannelMessages).
   * Merge vào config JSON hiện có, không xóa các khóa khác. Kết nối không thuộc
   * workspace -> 404.
   */
  async updateConnectionConfig(
    userId: string,
    workspaceId: string,
    connectionId: string,
    dto: UpdateConnectionConfigDto,
  ): Promise<IntegrationConnectionView> {
    await this.assertMembership(userId, workspaceId);
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!conn) {
      throw new NotFoundException("Không tìm thấy kết nối");
    }
    const existingConfig =
      conn.config && typeof conn.config === "object" && !Array.isArray(conn.config)
        ? (conn.config as Record<string, unknown>)
        : {};
    const updated = await this.prisma.integrationConnection.update({
      where: { id: conn.id },
      data: {
        config: {
          ...existingConfig,
          captureChannelMessages: dto.captureChannelMessages,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `Đã cập nhật config kết nối ${conn.provider} ${conn.id}: captureChannelMessages=${dto.captureChannelMessages}`,
    );
    return this.toView(updated);
  }

  /** GET /workspaces/:workspaceId/integrations — không lộ secret/token. */
  async listConnections(
    userId: string,
    workspaceId: string,
  ): Promise<IntegrationConnectionView[]> {
    await this.assertMembership(userId, workspaceId);
    const conns = await this.prisma.integrationConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return conns.map((conn) => this.toView(conn));
  }

  /** DELETE /workspaces/:workspaceId/integrations/:connectionId */
  async disconnect(
    userId: string,
    workspaceId: string,
    connectionId: string,
  ): Promise<IntegrationConnectionView> {
    await this.assertMembership(userId, workspaceId);
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!conn) {
      throw new NotFoundException("Không tìm thấy kết nối");
    }
    await this.prisma.integrationConnection.delete({ where: { id: conn.id } });
    this.logger.log(
      `Đã ngắt kết nối ${conn.provider} (${conn.externalAccountId ?? conn.id}) khỏi workspace ${workspaceId}`,
    );
    return this.toView(conn);
  }

  // ---------- Email intake ----------

  /** GET /workspaces/:workspaceId/intake-email — địa chỉ nhận việc qua email của workspace. */
  async getIntakeEmail(userId: string, workspaceId: string) {
    await this.assertMembership(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { slug: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException("Không tìm thấy workspace");
    }
    const address = `intake+${workspace.slug}@${INTAKE_EMAIL_DOMAIN}`;
    return {
      address,
      instructions:
        `Gửi hoặc chuyển tiếp (forward) email công việc tới ${address}. ` +
        "Mỗi email sẽ xuất hiện trong Triage của workspace dưới kênh EMAIL: " +
        "tiêu đề email thành tiêu đề yêu cầu, nội dung email thành mô tả, " +
        "người gửi thành người yêu cầu. Email gửi trùng (cùng Message-ID) chỉ tạo một mục.",
    };
  }

  // ---------- Dùng cho webhooks (không có ngữ cảnh user) ----------

  /** Tìm kết nối GitHub đang ACTIVE theo repo "owner/repo" (webhook không kèm workspace). */
  async findActiveGithubConnection(
    repoFullName: string,
  ): Promise<IntegrationConnection | null> {
    return this.prisma.integrationConnection.findFirst({
      where: {
        provider: "GITHUB",
        externalAccountId: repoFullName,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Giải mã webhookSecret của 1 kết nối GitHub. Trả null nếu chưa cấu hình/hỏng. */
  getGithubWebhookSecret(conn: IntegrationConnection): string | null {
    if (!conn.encryptedCredentials) return null;
    const plain = decryptSecret(conn.encryptedCredentials);
    if (!plain) return null;
    try {
      const parsed = JSON.parse(plain) as { webhookSecret?: unknown };
      return typeof parsed.webhookSecret === "string" &&
        parsed.webhookSecret.length > 0
        ? parsed.webhookSecret
        : null;
    } catch {
      return null;
    }
  }

  /** Tìm kết nối Slack đang ACTIVE theo team id (webhook Slack không kèm workspace). */
  async findActiveSlackConnection(
    slackTeamId: string,
  ): Promise<IntegrationConnection | null> {
    return this.prisma.integrationConnection.findFirst({
      where: {
        provider: "SLACK",
        externalAccountId: slackTeamId,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Giải mã signingSecret của 1 kết nối Slack. Trả null nếu chưa cấu hình/hỏng. */
  getSlackSigningSecret(conn: IntegrationConnection): string | null {
    if (!conn.encryptedCredentials) return null;
    const plain = decryptSecret(conn.encryptedCredentials);
    if (!plain) return null;
    try {
      const parsed = JSON.parse(plain) as { signingSecret?: unknown };
      return typeof parsed.signingSecret === "string" &&
        parsed.signingSecret.length > 0
        ? parsed.signingSecret
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Kết nối Slack có đang bật bắt tin nhắn kênh (Events API message) không.
   * Mặc định TẮT — chỉ bật khi config.captureChannelMessages === true, để tránh
   * nuốt mọi tin nhắn trong kênh Slack của khách vào Triage.
   */
  isSlackCaptureEnabled(conn: IntegrationConnection): boolean {
    const config =
      conn.config && typeof conn.config === "object" && !Array.isArray(conn.config)
        ? (conn.config as Record<string, unknown>)
        : {};
    return config.captureChannelMessages === true;
  }

  /** Tìm kết nối Zalo OA đang ACTIVE theo OA id (webhook Zalo không kèm workspace). */
  async findActiveZaloConnection(
    oaId: string,
  ): Promise<IntegrationConnection | null> {
    return this.prisma.integrationConnection.findFirst({
      where: {
        provider: "ZALO",
        externalAccountId: oaId,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Giải mã secretKey của 1 kết nối Zalo. Trả null nếu chưa cấu hình/hỏng. */
  getZaloSecretKey(conn: IntegrationConnection): string | null {
    if (!conn.encryptedCredentials) return null;
    const plain = decryptSecret(conn.encryptedCredentials);
    if (!plain) return null;
    try {
      const parsed = JSON.parse(plain) as { secretKey?: unknown };
      return typeof parsed.secretKey === "string" && parsed.secretKey.length > 0
        ? parsed.secretKey
        : null;
    } catch {
      return null;
    }
  }

  async findWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({ where: { slug } });
  }

  /**
   * Tạo IntakeItem từ webhook với chống trùng, giữ NGUYÊN định dạng của intake simulate:
   * dedupeKey = "<CHANNEL>:<workspaceId>:<externalId>". Gửi lại cùng externalId
   * (GitHub redelivery, email forward trùng Message-ID) -> trả item cũ, không tạo trùng.
   */
  async createWebhookIntakeItem(input: CreateIntakeItemInput) {
    const dedupeKey = input.externalId
      ? `${input.channel}:${input.workspaceId}:${input.externalId}`
      : undefined;

    if (dedupeKey) {
      const existing = await this.prisma.intakeItem.findFirst({
        where: { dedupeKey },
      });
      if (existing) {
        return { item: existing, created: false };
      }
    }

    try {
      const item = await this.prisma.intakeItem.create({
        data: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          triageStatus: "NEW",
          title: input.title,
          content: input.content ?? null,
          senderName: input.senderName ?? null,
          senderRef: input.senderRef ?? null,
          externalId: input.externalId ?? null,
          externalUrl: input.externalUrl ?? null,
          dedupeKey: dedupeKey ?? null,
          rawPayload:
            (input.rawPayload as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      return { item, created: true };
    } catch (error) {
      // Hai delivery chạy đồng thời cùng dedupeKey: đọc lại item đã thắng cuộc đua.
      if (
        dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.intakeItem.findFirst({
          where: { dedupeKey },
        });
        if (existing) return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * Đặt trạng thái 1 Issue theo mã hiển thị (VD "DEV-1") trong 1 workspace.
   * Đồng bộ cả `status` lẫn `statusGroup`. Đặt lặp lại cùng trạng thái là vô hại.
   */
  async setIssueStatusByKey(
    workspaceId: string,
    issueKey: string,
    status: Extract<IssueStatus, "IN_PROGRESS" | "DONE">,
  ) {
    const match = /^([A-Z]+)-(\d+)$/.exec(issueKey);
    if (!match) {
      return { issueKey, applied: false, reason: "invalid_key" };
    }
    const [, teamKey, numberText] = match;
    const team = await this.prisma.team.findFirst({
      where: { workspaceId, key: teamKey },
      select: { id: true },
    });
    if (!team) {
      return { issueKey, applied: false, reason: "team_not_found" };
    }
    const issue = await this.prisma.issue.findFirst({
      where: { workspaceId, teamId: team.id, number: Number(numberText) },
      select: { id: true, status: true },
    });
    if (!issue) {
      return { issueKey, applied: false, reason: "issue_not_found" };
    }
    if (issue.status === status) {
      return {
        issueKey,
        issueId: issue.id,
        applied: true,
        changed: false,
        from: issue.status,
        to: status,
      };
    }
    await this.prisma.issue.update({
      where: { id: issue.id },
      data: { status, statusGroup: status },
    });
    return {
      issueKey,
      issueId: issue.id,
      applied: true,
      changed: true,
      from: issue.status,
      to: status,
    };
  }
}
