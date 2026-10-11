import { IsOptional, IsUUID, Matches } from "class-validator";

export class AvailabilityQueryDto {
  @IsUUID()
  dealershipId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  serviceTypeId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
