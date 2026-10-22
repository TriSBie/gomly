import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCycleDto {
  @IsUUID("4", { message: "teamId phải là UUID" })
  teamId!: string;

  /** Thiếu name → service tự sinh "Cycle N" theo số cycle của team. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsDateString({}, { message: "startsAt phải là ngày giờ ISO 8601" })
  startsAt!: string;

  @IsDateString({}, { message: "endsAt phải là ngày giờ ISO 8601" })
  endsAt!: string;
}

export class AttachIssueToCycleDto {
  @IsUUID("4", { message: "issueId phải là UUID" })
  issueId!: string;
}

export class CloseCycleDto {
  /**
   * Chấp nhận để tương thích hợp đồng; vòng đời MVP luôn lăn issue sang
   * cycle mới của CÙNG team (theo PRD), nên trường này hiện chưa dùng.
   */
  @IsOptional()
  @IsUUID("4", { message: "rolloverTeamId phải là UUID" })
  rolloverTeamId?: string;

  /** true → tạo cycle kế tiếp cùng team và lăn các issue chưa Done/Canceled sang. */
  @IsOptional()
  @IsBoolean()
  createNext?: boolean;

  @IsOptional()
  @IsDateString({}, { message: "nextStartsAt phải là ngày giờ ISO 8601" })
  nextStartsAt?: string;

  @IsOptional()
  @IsDateString({}, { message: "nextEndsAt phải là ngày giờ ISO 8601" })
  nextEndsAt?: string;
}
