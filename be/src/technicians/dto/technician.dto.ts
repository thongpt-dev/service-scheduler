import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;

export class CreateTechnicianDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeCode?: string;
}

export class UpdateTechnicianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTechnicianQualificationDto {
  @IsUUID()
  serviceTypeId!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateTechnicianQualificationDto {
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;
}

export class CreateTechnicianShiftDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  @Matches(localTimePattern)
  startLocalTime!: string;

  @IsString()
  @Matches(localTimePattern)
  endLocalTime!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTechnicianShiftDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  startLocalTime?: string;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  endLocalTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTechnicianLeaveDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class UpdateTechnicianLeaveDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;
}
