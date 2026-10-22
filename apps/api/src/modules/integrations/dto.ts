import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/** Body của POST /workspaces/:workspaceId/integrations/github */
export class ConnectGithubDto {
  /** Repo dạng "owner/repo", VD "acme/widgets". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, {
    message: "repoFullName phải có dạng owner/repo",
  })
  repoFullName!: string;

  /**
   * Secret đã cấu hình ở phía GitHub webhook (Settings → Webhooks → Secret).
   * Server chỉ lưu bản mã hóa AES-256-GCM, không bao giờ trả lại trong response.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  webhookSecret!: string;
}

/** Body của POST /workspaces/:workspaceId/integrations/slack */
export class ConnectSlackDto {
  /** Team ID của Slack workspace, VD "T0123ABC". Dùng làm externalAccountId của kết nối. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^T[A-Z0-9]+$/, {
    message: "slackTeamId phải bắt đầu bằng T và chỉ gồm chữ hoa/số",
  })
  slackTeamId!: string;

  /** Tên hiển thị của Slack workspace (không bắt buộc). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slackTeamName?: string;

  /**
   * Signing Secret của Slack app (Basic Information → Signing Secret ở api.slack.com).
   * Dùng để kiểm chữ ký v0 của mọi request Slack gửi tới. Server chỉ lưu bản
   * mã hóa AES-256-GCM, không bao giờ trả lại trong response.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  signingSecret!: string;
}

/** Body của POST /workspaces/:workspaceId/integrations/zalo */
export class ConnectZaloDto {
  /** ID của Zalo Official Account (OA) của team. Dùng làm externalAccountId của kết nối. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  oaId!: string;

  /** ID ứng dụng Zalo (Zalo App) liên kết với OA — không bắt buộc ở mức khung. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  appId?: string;

  /**
   * Secret Key của ứng dụng Zalo (dùng cho OA API / xác thực về sau).
   * Không bắt buộc ở mức khung; nếu gửi lên, server chỉ lưu bản mã hóa
   * AES-256-GCM, không bao giờ trả lại trong response.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  secretKey?: string;
}

/** Body của PATCH /workspaces/:workspaceId/integrations/:connectionId/config */
export class UpdateConnectionConfigDto {
  /**
   * Bật/tắt việc tự bắt tin nhắn kênh Slack công khai (Events API) vào Triage.
   * Mặc định TẮT. Chỉ có ý nghĩa với kết nối SLACK.
   */
  @IsBoolean()
  captureChannelMessages!: boolean;
}
