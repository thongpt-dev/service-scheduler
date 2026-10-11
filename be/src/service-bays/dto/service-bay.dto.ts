import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateServiceBayDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  bayCode!: string;
}

export class UpdateServiceBayDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  bayCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateServiceBayCapabilityDto {
  @IsUUID()
  serviceTypeId!: string;
}
