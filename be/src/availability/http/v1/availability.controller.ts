import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard } from "../../../auth/auth.guard";
import { AuthRoles } from "../../../auth/auth-roles.decorator";
import { CurrentAuth } from "../../../auth/current-auth.decorator";
import type { AuthContext } from "../../../auth/auth.types";
import { AvailabilityQueryDto } from "../../dto/availability-query.dto";
import { AvailabilityService } from "../../availability.service";

@ApiTags("availability v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "availability", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class AvailabilityControllerV1 {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: "Find advisory appointment start times",
    description:
      "Returns candidate starts for one dealership-local date. Customers search their own vehicle; staff must provide customerId. A vehicle must be explicitly assigned to this dealership. This endpoint does not reserve a slot.",
  })
  @ApiQuery({
    name: "dealershipId",
    required: true,
    format: "uuid",
    example: "11111111-1111-4111-8111-111111111111",
  })
  @ApiQuery({
    name: "vehicleId",
    required: true,
    format: "uuid",
    example: "66666666-6666-4666-8666-666666666666",
  })
  @ApiQuery({
    name: "serviceTypeId",
    required: true,
    format: "uuid",
    example: "22222222-2222-4222-8222-222222222222",
  })
  @ApiQuery({
    name: "date",
    required: true,
    example: "2026-10-20",
    description: "Calendar date in the dealership's IANA timezone.",
  })
  @ApiQuery({
    name: "customerId",
    required: false,
    format: "uuid",
    example: "55555555-5555-4555-8555-555555555555",
    description: "Required for staff-assisted availability searches.",
  })
  @ApiOkResponse({
    description:
      "Advisory candidate start times returned; no slot is reserved.",
    schema: {
      example: {
        dealershipId: "11111111-1111-4111-8111-111111111111",
        vehicleId: "66666666-6666-4666-8666-666666666666",
        serviceTypeId: "22222222-2222-4222-8222-222222222222",
        date: "2026-10-20",
        timezone: "America/Los_Angeles",
        durationMinutes: 60,
        slots: [
          {
            startsAt: "2026-10-20T16:00:00.000Z",
            endsAt: "2026-10-20T17:00:00.000Z",
            localStartTime: "09:00",
            utcOffset: "-07:00",
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      "Malformed IDs/date, staff search missing customerId, or date outside the 60-day booking horizon.",
  })
  @ApiForbiddenResponse({
    description: "Caller cannot access the dealership or selected customer.",
  })
  @ApiNotFoundResponse({
    description:
      "Dealership, customer, assigned vehicle, or active service offering not found.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  find(@CurrentAuth() auth: AuthContext, @Query() query: AvailabilityQueryDto) {
    return this.availabilityService.getAvailability(auth, query);
  }
}
