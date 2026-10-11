import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateVehicleDto {
  @IsString()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i)
  vin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  make!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @IsInt()
  @Min(1886)
  @Max(9999)
  year!: number;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  make?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1886)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GrantVehicleAccessDto {
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  vehicleId!: string;
}
