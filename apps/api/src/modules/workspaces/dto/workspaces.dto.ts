import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { MembershipRole } from "@prisma/client";

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Mã team viết hoa, VD "DEV" — tiền tố mã issue dạng DEV-123. */
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,10}$/, {
    message: "Key team chỉ gồm chữ/số, tối đa 10 ký tự",
  })
  key!: string;
}

/** Body của POST /workspaces/:id/members */
export class AddMemberDto {
  /** Email của người được thêm — phải ĐÃ có tài khoản Gomly (chưa có -> 404). */
  @IsEmail({}, { message: "email không hợp lệ" })
  @MaxLength(200)
  email!: string;

  /**
   * Vai trò trong workspace (mặc định MEMBER). Không gán được OWNER qua API
   * này (gửi OWNER -> 400) — quyền sở hữu chỉ chuyển qua đường riêng sau này.
   */
  @IsOptional()
  @IsEnum(MembershipRole, { message: "role phải là OWNER, ADMIN, MEMBER hoặc GUEST" })
  role?: MembershipRole;
}
