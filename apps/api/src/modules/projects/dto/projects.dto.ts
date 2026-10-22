import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { ProjectStatus } from "@prisma/client";

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: "targetDate phải là ngày giờ ISO 8601" })
  targetDate?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  /** Truyền null để xóa mô tả. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Truyền null để xóa ngày đích. */
  @IsOptional()
  @IsDateString({}, { message: "targetDate phải là ngày giờ ISO 8601" })
  targetDate?: string | null;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class AttachIssueToProjectDto {
  @IsUUID("4", { message: "issueId phải là UUID" })
  issueId!: string;
}
