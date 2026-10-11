import {
  IsEmail,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import type { DealershipMembershipRole } from "../../../../database/schema";

const provisionableRoles: DealershipMembershipRole[] = [
  "owner",
  "manager",
  "staff",
];

export class ProvisionStaffDto {
  @IsUUID()
  dealershipId!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsIn(provisionableRoles)
  role!: DealershipMembershipRole;
}
