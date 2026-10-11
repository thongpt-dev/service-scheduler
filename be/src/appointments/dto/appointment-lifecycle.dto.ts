import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

const zonedDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class CustomerAppointmentListQueryDto {
  @IsOptional()
  @IsIn(["upcoming", "past"])
  period: "upcoming" | "past" = "upcoming";

  @IsOptional()
  @IsIn(["confirmed", "cancelled", "completed", "no_show"])
  status?: "confirmed" | "cancelled" | "completed" | "no_show";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class DealershipAppointmentListQueryDto {
  @IsDateString()
  @Matches(zonedDateTimePattern)
  from!: string;

  @IsDateString()
  @Matches(zonedDateTimePattern)
  to!: string;

  @IsOptional()
  @IsIn(["confirmed", "cancelled", "completed", "no_show"])
  status?: "confirmed" | "cancelled" | "completed" | "no_show";

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  @Matches(zonedDateTimePattern)
  startsAt!: string;
}

export class UpdateAppointmentStatusDto {
  @IsIn(["completed", "no_show"])
  status!: "completed" | "no_show";
}
