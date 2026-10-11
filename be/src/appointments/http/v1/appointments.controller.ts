import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard } from "../../../auth/auth.guard";
import { AuthRoles } from "../../../auth/auth-roles.decorator";
import { CurrentAuth } from "../../../auth/current-auth.decorator";
import type { AuthContext } from "../../../auth/auth.types";
import {
  CreateSelfServiceAppointmentDto,
  CreateStaffAssistedAppointmentDto,
} from "../../dto/create-appointment.dto";
import { AppointmentsService } from "../../appointments.service";

@ApiTags("appointments v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "appointments", version: "1" })
@UseGuards(AuthGuard)
export class AppointmentsControllerV1 {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post("self-service")
  @AuthRoles("customer")
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "Unique key for this actor's appointment creation request.",
    example: "booking-20261020-001",
  })
  @ApiOperation({
    summary: "Confirm a customer self-service appointment",
    description:
      "The server revalidates the assigned vehicle, active offering, schedule, and capacity, then allocates a qualified technician and compatible bay. The customer ID comes from the token. Supply a unique Idempotency-Key for safe retries.",
  })
  @ApiBody({
    type: CreateSelfServiceAppointmentDto,
    examples: {
      default: {
        value: {
          dealershipId: "11111111-1111-4111-8111-111111111111",
          vehicleId: "66666666-6666-4666-8666-666666666666",
          serviceTypeId: "22222222-2222-4222-8222-222222222222",
          startsAt: "2026-10-20T16:00:00.000Z",
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Appointment confirmed and resources assigned.",
  })
  @ApiBadRequestResponse({
    description: "Invalid UUID, timestamp, or Idempotency-Key.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiNotFoundResponse({
    description: "Customer, vehicle, dealership, or service is not accessible.",
  })
  @ApiConflictResponse({
    description:
      "SLOT_UNAVAILABLE when capacity is taken; IDEMPOTENCY_KEY_REUSED when the key is reused for a different request.",
  })
  createSelfService(
    @CurrentAuth() auth: AuthContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateSelfServiceAppointmentDto,
  ) {
    return this.appointmentsService
      .createSelfService(auth, body, idempotencyKey ?? "")
      .then(({ appointment }) => appointment);
  }

  @Post("staff-assisted")
  @AuthRoles("owner", "manager", "staff")
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "Unique key for this actor's appointment creation request.",
    example: "staff-booking-20261020-001",
  })
  @ApiOperation({
    summary: "Confirm a staff-assisted appointment",
    description:
      "Staff books for an associated customer. The server verifies customer vehicle access and dealership assignment, revalidates schedule/capacity, then allocates resources. Supply a unique Idempotency-Key for safe retries.",
  })
  @ApiBody({
    type: CreateStaffAssistedAppointmentDto,
    examples: {
      default: {
        value: {
          dealershipId: "11111111-1111-4111-8111-111111111111",
          customerId: "55555555-5555-4555-8555-555555555555",
          vehicleId: "66666666-6666-4666-8666-666666666666",
          serviceTypeId: "22222222-2222-4222-8222-222222222222",
          startsAt: "2026-10-20T16:00:00.000Z",
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Appointment confirmed and resources assigned.",
  })
  @ApiBadRequestResponse({
    description: "Invalid UUID, timestamp, or Idempotency-Key.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  @ApiForbiddenResponse({
    description: "Membership in the target dealership is required.",
  })
  @ApiNotFoundResponse({
    description: "Customer, vehicle, dealership, or service is not accessible.",
  })
  @ApiConflictResponse({
    description:
      "SLOT_UNAVAILABLE when capacity is taken; IDEMPOTENCY_KEY_REUSED when the key is reused for a different request.",
  })
  createStaffAssisted(
    @CurrentAuth() auth: AuthContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateStaffAssistedAppointmentDto,
  ) {
    return this.appointmentsService
      .createStaffAssisted(auth, body, idempotencyKey ?? "")
      .then(({ appointment }) => appointment);
  }
}
