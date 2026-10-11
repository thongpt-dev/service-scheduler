import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;

export class CreateDealershipHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  openTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  closeTime?: string | null;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class UpdateDealershipHoursDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  openTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(localTimePattern)
  closeTime?: string | null;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class CreateDealershipClosureDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class UpdateDealershipClosureDto {
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
