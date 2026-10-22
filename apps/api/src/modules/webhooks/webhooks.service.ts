import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { IntegrationsService } from "../integrations/integrations.service";

type Payload = Record<string, unknown>;

function asRecord(value: unknown): Payload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Mã issue dạng "DEV-123" (chữ hoa + số) xuất hiện trong text tự do. */
const ISSUE_KEY_PATTERN = /\b([A-Z]+-\d+)\b/g;

function extractIssueKeys(texts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(ISSUE_KEY_PATTERN)) {
      seen.add(match[1]);
    }
  }
  return [...seen];
}

/** Rút text thô đơn giản từ HTML (đủ cho nội dung email khi thiếu trường text). */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Rút gọn id người dùng Zalo để hiển thị (id đầy đủ vẫn lưu ở senderRef). */
function shortenZaloId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private warnedEmailSecretMissing = false;
  private warnedZaloSignatureUnverified = false;

  constructor(private readonly integrations: IntegrationsService) {}

  // ---------- GitHub: POST /webhooks/github ----------

  /**
   * Xử lý webhook GitHub.
   * - Xác thực HMAC-SHA256 (header x-hub-signature-256) bằng webhookSecret của
   *   IntegrationConnection khớp repository.full_name. Sai chữ ký -> 401.
   * - Không có kết nối ACTIVE cho repo -> 404 (vẫn ghi log).
   * - issues.opened -> IntakeItem kênh GITHUB (dedupe theo externalId như intake simulate).
   * - pull_request -> trích mã issue (title/body/branch) và dịch trạng thái Issue:
   *   opened/reopened/synchronize -> IN_PROGRESS; closed + merged -> DONE.
   */
  async handleGithub(input: {
    event: string | undefined;
    signature: string | undefined;
    deliveryId: string | undefined;
    rawBody: string;
    payload: Payload;
  }) {
    const { payload } = input;
    const repository = asRecord(payload.repository);
    const repoFullName = repository ? asString(repository.full_name) : null;
    if (!repoFullName) {
      throw new BadRequestException("Payload thiếu repository.full_name");
    }

    const connection =
      await this.integrations.findActiveGithubConnection(repoFullName);
    if (!connection) {
      this.logger.warn(
        `GitHub webhook: không có kết nối ACTIVE cho repo ${repoFullName} (event=${input.event ?? "?"}, delivery=${input.deliveryId ?? "?"}) — bỏ qua với 404`,
      );
      throw new NotFoundException(
        `Không tìm thấy kết nối GitHub cho repo ${repoFullName}`,
      );
    }

    const secret = this.integrations.getGithubWebhookSecret(connection);
    if (!secret) {
      this.logger.error(
        `Kết nối GitHub ${connection.id} (repo ${repoFullName}) không đọc được webhookSecret đã lưu`,
      );
      throw new UnauthorizedException(
        "Kết nối GitHub chưa cấu hình webhook secret",
      );
    }
    if (!this.verifyGithubSignature(input.signature, secret, input.rawBody)) {
      this.logger.warn(
        `GitHub webhook: chữ ký không hợp lệ cho repo ${repoFullName} (delivery=${input.deliveryId ?? "?"})`,
      );
      throw new UnauthorizedException("Chữ ký webhook GitHub không hợp lệ");
    }

    const workspaceId = connection.workspaceId;
    const action = asString(payload.action);
    const effects: Array<Record<string, unknown>> = [];

    if (input.event === "issues" && action === "opened") {
      const issue = asRecord(payload.issue);
      if (issue && typeof issue.number === "number") {
        const user = asRecord(issue.user);
        const externalId = `${repoFullName}#${issue.number}`;
        const { item, created } =
          await this.integrations.createWebhookIntakeItem({
            workspaceId,
            channel: "GITHUB",
            title: asString(issue.title) ?? externalId,
            content: asString(issue.body),
            senderName: user ? asString(user.login) : null,
            senderRef:
              user && typeof user.id === "number" ? String(user.id) : null,
            externalId,
            externalUrl: asString(issue.html_url),
            rawPayload: {
              source: "github-webhook",
              event: "issues",
              action,
              deliveryId: input.deliveryId ?? null,
              payload,
            },
          });
        effects.push({
          type: "intake_item",
          channel: "GITHUB",
          intakeItemId: item.id,
          externalId,
          created,
        });
      }
    } else if (input.event === "pull_request") {
      const pr = asRecord(payload.pull_request);
      const head = pr ? asRecord(pr.head) : null;
      const keys = extractIssueKeys([
        pr ? asString(pr.title) : null,
        pr ? asString(pr.body) : null,
        head ? asString(head.ref) : null,
      ]);

      if (
        action === "opened" ||
        action === "reopened" ||
        action === "synchronize"
      ) {
        for (const key of keys) {
          const result = await this.integrations.setIssueStatusByKey(
            workspaceId,
            key,
            "IN_PROGRESS",
          );
          effects.push({ type: "issue_status", ...result });
        }
      } else if (action === "closed" && pr?.merged === true) {
        for (const key of keys) {
          const result = await this.integrations.setIssueStatusByKey(
            workspaceId,
            key,
            "DONE",
          );
          effects.push({ type: "issue_status", ...result });
        }
      }

      if (effects.length === 0) {
        effects.push({
          type: "ignored",
          event: "pull_request",
          action,
          reason:
            keys.length === 0
              ? "no_issue_key_found"
              : "action_not_tracked",
          issueKeys: keys,
        });
      }
    } else {
      effects.push({
        type: "ignored",
        event: input.event ?? null,
        action,
        reason: "event_not_tracked",
      });
    }

    return {
      received: true,
      event: input.event ?? null,
      delivery: input.deliveryId ?? null,
      effects,
    };
  }

  private verifyGithubSignature(
    signatureHeader: string | undefined,
    secret: string,
    rawBody: string,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expectedHex = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    return safeEqual(signatureHeader.slice("sha256=".length), expectedHex);
  }

  // ---------- Slack: POST /webhooks/slack ----------

  /**
   * Xử lý mọi request Slack gửi tới (slash command, message action, Events API).
   *
   * Xác thực chữ ký v0 của Slack (https://api.slack.com/authentication/verifying-requests-from-slack):
   *   basestring = "v0:" + x-slack-request-timestamp + ":" + rawBody (bytes gốc)
   *   signature  = "v0=" + HMAC-SHA256(signingSecret, basestring)
   * Request có timestamp lệch hiện tại quá 5 phút bị từ chối (chống replay).
   * signingSecret lấy từ IntegrationConnection SLACK khớp team id trong payload.
   *
   * Các dạng payload:
   * 1. url_verification (JSON {type, challenge, team_id}) -> trả { challenge }.
   *    Đây là bước bắt buộc khi đăng ký Request URL ở Slack: nếu đã có kết nối cho
   *    team này thì vẫn kiểm chữ ký trước; chưa có kết nối thì trả challenge kèm
   *    log cảnh báo (không tạo dữ liệu gì, chỉ để hoàn tất đăng ký URL lần đầu).
   * 2. Slash command (form-urlencoded: command, text, user_name, trigger_id...)
   *    -> IntakeItem SLACK, externalId = trigger_id (dedupe như các kênh khác).
   *    Trả thông báo ephemeral kiểu Slack.
   * 3. Message action / shortcut (JSON {type: "message_action", trigger_id,
   *    team: {id}, user: {name|username}, message: {text}, channel: {name}})
   *    -> IntakeItem SLACK, externalId = trigger_id. Trả { ok: true }.
   * 4. Events API (JSON {type: "event_callback", team_id, event_id, event}):
   *    chỉ bắt event message ở kênh công khai KHI kết nối bật
   *    config.captureChannelMessages (mặc định TẮT). externalId = "<team_id>:<event.ts>"
   *    (ts là định danh duy nhất của tin nhắn; event_id của envelope được lưu
   *    trong rawPayload để truy vết và chống trùng bổ sung).
   * Không tìm thấy kết nối ACTIVE cho team id -> 404 (trừ url_verification).
   */
  async handleSlack(input: {
    signature: string | undefined;
    timestamp: string | undefined;
    rawBody: string;
    payload: Payload;
  }) {
    const { payload } = input;
    const teamRecord = asRecord(payload.team);
    const teamId =
      asString(payload.team_id) ??
      (teamRecord ? asString(teamRecord.id) : null);

    // 1. URL verification — bước bắt buộc của Slack Events API/Interactivity.
    if (payload.type === "url_verification") {
      const challenge = asString(payload.challenge);
      if (!challenge) {
        throw new BadRequestException("Payload url_verification thiếu challenge");
      }
      const conn = teamId
        ? await this.integrations.findActiveSlackConnection(teamId)
        : null;
      if (conn) {
        const secret = this.integrations.getSlackSigningSecret(conn);
        if (!secret) {
          throw new UnauthorizedException(
            "Kết nối Slack chưa cấu hình signing secret",
          );
        }
        if (
          !this.verifySlackSignature(
            input.signature,
            input.timestamp,
            secret,
            input.rawBody,
          )
        ) {
          throw new UnauthorizedException("Chữ ký Slack không hợp lệ");
        }
      } else {
        this.logger.warn(
          `Slack url_verification cho team ${teamId ?? "?"} chưa có kết nối ACTIVE — vẫn trả challenge để hoàn tất đăng ký URL`,
        );
      }
      return { challenge };
    }

    if (!teamId) {
      throw new BadRequestException("Payload Slack thiếu team_id");
    }
    const connection =
      await this.integrations.findActiveSlackConnection(teamId);
    if (!connection) {
      this.logger.warn(
        `Slack webhook: không có kết nối ACTIVE cho team ${teamId} (type=${asString(payload.type) ?? "form"}) — bỏ qua với 404`,
      );
      throw new NotFoundException(
        `Không tìm thấy kết nối Slack cho team ${teamId}`,
      );
    }
    const secret = this.integrations.getSlackSigningSecret(connection);
    if (!secret) {
      this.logger.error(
        `Kết nối Slack ${connection.id} (team ${teamId}) không đọc được signingSecret đã lưu`,
      );
      throw new UnauthorizedException(
        "Kết nối Slack chưa cấu hình signing secret",
      );
    }
    if (
      !this.verifySlackSignature(
        input.signature,
        input.timestamp,
        secret,
        input.rawBody,
      )
    ) {
      this.logger.warn(
        `Slack webhook: chữ ký không hợp lệ hoặc timestamp quá hạn cho team ${teamId}`,
      );
      throw new UnauthorizedException("Chữ ký Slack không hợp lệ");
    }

    const workspaceId = connection.workspaceId;

    // 2. Slash command (form-urlencoded — có trường `command`).
    const command = asString(payload.command);
    if (command) {
      const text = asString(payload.text) ?? "";
      const channelName = asString(payload.channel_name);
      const triggerId = asString(payload.trigger_id);
      const { item, created } =
        await this.integrations.createWebhookIntakeItem({
          workspaceId,
          channel: "SLACK",
          title: this.slackTitle(text),
          content: [
            `Từ Slack qua lệnh ${command}${channelName ? ` tại kênh #${channelName}` : ""}:`,
            "",
            text || "(nội dung trống)",
          ].join("\n"),
          senderName: asString(payload.user_name),
          senderRef: asString(payload.user_id),
          externalId: triggerId,
          rawPayload: {
            source: "slack-slash-command",
            command,
            payload,
          },
        });
      this.logger.log(
        `Slack slash command ${command} (team ${teamId}) -> IntakeItem ${item.id} (created=${created})`,
      );
      return {
        response_type: "ephemeral",
        text: "Đã ghi nhận yêu cầu vào Gomly Triage ✅",
      };
    }

    // 3. Message action / shortcut.
    if (payload.type === "message_action") {
      const message = asRecord(payload.message);
      const user = asRecord(payload.user);
      const channel = asRecord(payload.channel);
      const messageText = message ? (asString(message.text) ?? "") : "";
      const channelName = channel ? asString(channel.name) : null;
      const triggerId = asString(payload.trigger_id);
      const { item, created } =
        await this.integrations.createWebhookIntakeItem({
          workspaceId,
          channel: "SLACK",
          title: this.slackTitle(messageText),
          content: [
            `Từ tin nhắn Slack${channelName ? ` tại kênh #${channelName}` : ""} (message action):`,
            "",
            messageText || "(nội dung trống)",
          ].join("\n"),
          senderName: user
            ? (asString(user.name) ?? asString(user.username))
            : null,
          senderRef: user ? asString(user.id) : null,
          externalId: triggerId,
          rawPayload: {
            source: "slack-message-action",
            callbackId: asString(payload.callback_id),
            payload,
          },
        });
      this.logger.log(
        `Slack message_action (team ${teamId}) -> IntakeItem ${item.id} (created=${created})`,
      );
      return { ok: true };
    }

    // 4. Events API.
    if (payload.type === "event_callback") {
      const event = asRecord(payload.event);
      const ignored = (reason: string) => ({
        received: true,
        event: "event_callback",
        created: false,
        reason,
      });
      if (!event || event.type !== "message") {
        return ignored("event_not_message");
      }
      // Bỏ qua tin nhắn của bot / sự kiện con (tránh vòng lặp và rác Triage).
      if (
        asString(event.subtype) ||
        asString(event.bot_id) ||
        event.hidden === true
      ) {
        return ignored("message_subtype_or_bot");
      }
      // Chỉ bắt tin nhắn ở kênh công khai (channel), không bắt DM/group riêng.
      if (event.channel_type !== "channel") {
        return ignored("not_public_channel");
      }
      if (!this.integrations.isSlackCaptureEnabled(connection)) {
        return ignored("capture_disabled");
      }
      const text = asString(event.text) ?? "";
      const ts = asString(event.ts);
      if (!ts) {
        return ignored("missing_event_ts");
      }
      const { item, created } =
        await this.integrations.createWebhookIntakeItem({
          workspaceId,
          channel: "SLACK",
          title: this.slackTitle(text),
          content: text || "(nội dung trống)",
          senderName: null,
          senderRef: asString(event.user),
          externalId: `${teamId}:${ts}`,
          rawPayload: {
            source: "slack-event-message",
            eventId: asString(payload.event_id),
            payload,
          },
        });
      this.logger.log(
        `Slack event message (team ${teamId}, ts=${ts}) -> IntakeItem ${item.id} (created=${created})`,
      );
      return {
        received: true,
        event: "event_callback",
        created,
        intakeItemId: item.id,
        channel: "SLACK",
      };
    }

    // Các dạng còn lại (app_mention không đăng ký, view_submission...) — nhận êm.
    return {
      received: true,
      created: false,
      reason: "payload_type_not_tracked",
      type: asString(payload.type),
    };
  }

  /** Tiêu đề IntakeItem từ nội dung Slack: rút gọn 1 dòng, tối đa 140 ký tự. */
  private slackTitle(text: string): string {
    const oneLine = text.replace(/\s+/g, " ").trim();
    if (!oneLine) return "(không tiêu đề)";
    return oneLine.length > 140 ? `${oneLine.slice(0, 137)}...` : oneLine;
  }

  /**
   * Kiểm chữ ký Slack v0. Trả false khi: thiếu header, timestamp không phải số,
   * lệch quá 5 phút (chống replay), hoặc HMAC không khớp (so sánh timing-safe).
   */
  private verifySlackSignature(
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
    signingSecret: string,
    rawBody: string,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith("v0=")) {
      return false;
    }
    if (!timestampHeader) return false;
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > 60 * 5) return false;
    const baseString = `v0:${timestampHeader}:${rawBody}`;
    const expectedHex = createHmac("sha256", signingSecret)
      .update(baseString, "utf8")
      .digest("hex");
    return safeEqual(signatureHeader.slice("v0=".length), expectedHex);
  }

  // ---------- Zalo OA: POST /webhooks/zalo (phương án A — mức KHUNG) ----------

  /**
   * Xử lý webhook Zalo OA — MỨC KHUNG theo memo `research/zalo-api-spike.md`,
   * CHƯA kiểm chứng với Zalo thật (chưa có OA + ứng dụng được duyệt để thử).
   *
   * Payload kỳ vọng (theo tài liệu sự kiện OA): { event_name, app_id?, oa_id?
   * (hoặc recipient.id), sender: { id }, message: { text?, msg_id?, attachments? },
   * timestamp? }. OA được tra bằng oa_id -> IntegrationConnection ZALO ACTIVE;
   * không có kết nối -> 404.
   * - `user_send_text` -> IntakeItem ZALO, title/content từ message.text.
   * - Các `user_send_*` khác (image/file/audio/video/link/sticker/location) ->
   *   vẫn ghi nhận: title dạng "[<event_name>]" + nội dung nếu có.
   * - Sự kiện không phải tin nhắn người dùng (follow/unfollow, oa_send_*, lạ...)
   *   -> 200 ignored.
   * Dedupe theo dedupeKey "ZALO:<workspaceId>:<msg_id>" như các kênh khác.
   *
   * ⚠️ CHỮ KÝ CHƯA ĐƯỢC KIỂM: memo spike ghi nhận Zalo có header
   * `X-ZEvent-Signature` (nguồn phụ trợ Infobip/mirror tài liệu) nhưng CHƯA xác
   * nhận được thuật toán ký chính thức từ developers.zalo.me. Vì vậy endpoint
   * này hiện KHÔNG kiểm chữ ký — không bịa thuật toán. Webhook Zalo chỉ được
   * bật cho khách thật SAU KHI đối chiếu tài liệu chính thức và bổ sung lớp
   * xác thực; hiện tại mọi request đều ghi log cảnh báo.
   */
  async handleZalo(input: {
    signature: string | undefined;
    payload: Payload;
  }) {
    if (!this.warnedZaloSignatureUnverified) {
      this.warnedZaloSignatureUnverified = true;
      this.logger.error(
        "POST /webhooks/zalo đang KHÔNG kiểm chữ ký sự kiện (X-ZEvent-Signature): " +
          "memo spike chưa xác nhận được thuật toán ký chính thức của Zalo. " +
          "Chỉ dùng khung này để phát triển — phải đối chiếu developers.zalo.me và bổ sung xác thực trước khi dùng thật.",
      );
    }

    const { payload } = input;
    const recipient = asRecord(payload.recipient);
    const oaId =
      asString(payload.oa_id) ??
      (recipient ? asString(recipient.id) : null);
    if (!oaId) {
      throw new BadRequestException(
        "Payload Zalo thiếu oa_id (hoặc recipient.id)",
      );
    }

    const connection =
      await this.integrations.findActiveZaloConnection(oaId);
    if (!connection) {
      this.logger.warn(
        `Zalo webhook: không có kết nối ACTIVE cho OA ${oaId} (event=${asString(payload.event_name) ?? "?"}) — bỏ qua với 404`,
      );
      throw new NotFoundException(
        `Không tìm thấy kết nối Zalo cho OA ${oaId}`,
      );
    }

    const eventName = asString(payload.event_name) ?? "";
    const ignored = (reason: string) => ({
      received: true,
      ignored: true,
      event: eventName || null,
      reason,
    });

    // Chỉ sự kiện người dùng gửi tới OA mới là intake; còn lại nhận êm 200.
    if (!eventName.startsWith("user_send_")) {
      return ignored("event_not_user_message");
    }

    const sender = asRecord(payload.sender);
    const senderId = sender ? asString(sender.id) : null;
    const message = asRecord(payload.message);
    const msgId = message ? asString(message.msg_id) : null;
    const text = message ? asString(message.text) : null;

    let title: string;
    let content: string | null;
    if (eventName === "user_send_text") {
      title = this.zaloTitle(text ?? "");
      content = text;
    } else {
      const attachments =
        message && Array.isArray(message.attachments)
          ? message.attachments
          : [];
      const firstAttachment =
        attachments.length > 0 ? asRecord(attachments[0]) : null;
      const attachmentType = firstAttachment
        ? asString(firstAttachment.type)
        : null;
      title = `[${eventName}]${text ? ` ${this.zaloTitle(text)}` : ""}`;
      content =
        text ??
        (attachmentType
          ? `Người dùng Zalo gửi đính kèm loại "${attachmentType}" (sự kiện ${eventName})`
          : `Sự kiện ${eventName}: nội dung không phải văn bản, xem rawPayload để biết chi tiết`);
    }

    const { item, created } =
      await this.integrations.createWebhookIntakeItem({
        workspaceId: connection.workspaceId,
        channel: "ZALO",
        title,
        content,
        senderName: senderId ? `Zalo user ${shortenZaloId(senderId)}` : null,
        senderRef: senderId,
        externalId: msgId,
        rawPayload: {
          source: "zalo-oa-webhook",
          event_name: eventName,
          // Khung chưa kiểm chứng: chữ ký sự kiện CHƯA được kiểm (xem cảnh báo ở đầu hàm).
          signatureVerified: false,
          payload,
        },
      });
    this.logger.log(
      `Zalo ${eventName} (OA ${oaId}) -> IntakeItem ${item.id} (created=${created})`,
    );
    return {
      received: true,
      created,
      intakeItemId: item.id,
      channel: "ZALO",
      event: eventName,
    };
  }

  /** Tiêu đề IntakeItem từ nội dung Zalo: rút gọn 1 dòng, tối đa 140 ký tự (cùng mẫu Slack). */
  private zaloTitle(text: string): string {
    const oneLine = text.replace(/\s+/g, " ").trim();
    if (!oneLine) return "(không tiêu đề)";
    return oneLine.length > 140 ? `${oneLine.slice(0, 137)}...` : oneLine;
  }

  // ---------- Email inbound: POST /webhooks/email ----------

  /**
   * Nhận email từ dịch vụ inbound (Mailgun/SendGrid/Postmark kiểu payload chung).
   * Workspace được suy ra từ địa chỉ nhận intake+<workspaceSlug>@gomly.local.
   * Dedupe theo Message-ID (externalId) giống cơ chế intake hiện có.
   *
   * Bảo mật: nếu env INTAKE_EMAIL_SECRET được đặt, bắt buộc header
   * X-Intake-Secret khớp. Nếu env trống -> cho qua NHƯNG ghi cảnh báo error
   * (webhook đang mở công khai — chỉ chấp nhận được ở môi trường dev).
   */
  async handleEmail(input: {
    sharedSecret: string | undefined;
    payload: Payload;
  }) {
    const expectedSecret = process.env.INTAKE_EMAIL_SECRET;
    if (expectedSecret && expectedSecret.length > 0) {
      if (
        !input.sharedSecret ||
        !safeEqual(input.sharedSecret, expectedSecret)
      ) {
        throw new UnauthorizedException("X-Intake-Secret không hợp lệ");
      }
    } else if (!this.warnedEmailSecretMissing) {
      this.warnedEmailSecretMissing = true;
      this.logger.error(
        "INTAKE_EMAIL_SECRET chưa được cấu hình — POST /webhooks/email đang KHÔNG có xác thực. " +
          "Hãy đặt INTAKE_EMAIL_SECRET trước khi dùng ngoài môi trường dev.",
      );
    }

    const { payload } = input;
    const toRaw = Array.isArray(payload.to) ? payload.to[0] : payload.to;
    const to = asString(toRaw);
    if (!to) {
      throw new BadRequestException("Payload thiếu trường to");
    }
    const slugMatch = /intake\+([^@\s]+)@/i.exec(to);
    const slug = slugMatch ? slugMatch[1] : null;
    const workspace = slug
      ? await this.integrations.findWorkspaceBySlug(slug)
      : null;
    if (!workspace) {
      this.logger.warn(
        `Email webhook: địa chỉ nhận "${to}" không khớp workspace nào (slug=${slug ?? "?"})`,
      );
      throw new NotFoundException(
        "Địa chỉ intake không khớp workspace nào",
      );
    }

    // from dạng "Tên Hiển Thị <email@domain>" hoặc email thuần.
    const fromRaw = asString(payload.from) ?? "";
    let senderEmail: string | null = null;
    let senderDisplay: string | null = null;
    const bracket = /^(.*?)<([^>]+)>\s*$/.exec(fromRaw.trim());
    if (bracket) {
      senderDisplay = bracket[1].trim() || null;
      senderEmail = bracket[2].trim() || null;
    } else if (fromRaw.trim().length > 0) {
      senderEmail = fromRaw.trim();
    }
    const senderName =
      asString(payload.senderName) ?? senderDisplay ?? senderEmail;

    const text = asString(payload.text);
    const html = asString(payload.html);
    const content = text ?? (html ? stripHtml(html) : null);
    const messageId = asString(payload.messageId);

    const { item, created } =
      await this.integrations.createWebhookIntakeItem({
        workspaceId: workspace.id,
        channel: "EMAIL",
        title: asString(payload.subject) ?? "(Email không tiêu đề)",
        content,
        senderName,
        senderRef: senderEmail,
        externalId: messageId,
        externalUrl: null,
        rawPayload: {
          source: "email-webhook",
          to,
          payload,
        },
      });

    return {
      received: true,
      created,
      intakeItemId: item.id,
      workspaceId: workspace.id,
      channel: "EMAIL",
    };
  }
}
