import { IsDateString, IsUUID, Matches } from "class-validator";

const zonedDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

class CreateAppointmentFieldsDto {
  @IsUUID()
  dealershipId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  serviceTypeId!: string;

  @IsDateString()
  @Matches(zonedDateTimePattern)
  startsAt!: string;
}

export class CreateSelfServiceAppointmentDto extends CreateAppointmentFieldsDto {}

export class CreateStaffAssistedAppointmentDto extends CreateAppointmentFieldsDto {
  @IsUUID()
  customerId!: string;
}
