import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Body của POST /workspaces/:workspaceId/capture-links */
export class CreateCaptureLinkDto {
  /** Team mặc định cho yêu cầu gửi qua link này (không bắt buộc). Phải thuộc workspace. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  teamId?: string;

  /** Nhãn gợi nhớ, VD "Nhóm Zalo khách ABC". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

/** Body của POST /capture/:token (form công khai "Gửi yêu cầu"). */
export class SubmitCaptureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  senderName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  /**
   * Honeypot chống bot: trường này KHÔNG hiện trên form thật (người dùng không
   * bao giờ điền). Nếu có giá trị -> coi là bot, trả 201 giả và không tạo item.
   * Phải khai trong DTO vì ValidationPipe bật forbidNonWhitelisted.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
