import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard } from "../../../auth/auth.guard";
import { AuthRoles } from "../../../auth/auth-roles.decorator";
import { CurrentAuth } from "../../../auth/current-auth.decorator";
import type { AuthContext } from "../../../auth/auth.types";
import {
  CustomerAppointmentListQueryDto,
  DealershipAppointmentListQueryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentStatusDto,
} from "../../dto/appointment-lifecycle.dto";
import { AppointmentsService } from "../../appointments.service";

@ApiTags("appointments v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "appointments/me", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer")
export class CustomerAppointmentsControllerV1 {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({
    summary: "List the customer's upcoming or past appointments",
    description:
      "Returns only appointments belonging to the customer in the bearer token. Upcoming is the default; results are paginated.",
  })
  @ApiQuery({ name: "period", required: false, enum: ["upcoming", "past"] })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["confirmed", "cancelled", "completed", "no_show"],
  })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiQuery({ name: "offset", required: false, example: 0 })
  @ApiOkResponse({ description: "Appointments and pagination metadata." })
  @ApiBadRequestResponse({ description: "Invalid list filters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: CustomerAppointmentListQueryDto,
  ) {
    return this.appointmentsService.listCustomerAppointments(auth, query);
  }

  @Get(":appointmentId")
  @ApiOperation({
    summary: "Read one of the customer's appointments",
    description:
      "Returns an appointment only when it belongs to the customer in the bearer token.",
  })
  @ApiParam({ name: "appointmentId", format: "uuid" })
  @ApiOkResponse({ description: "Appointment details." })
  @ApiNotFoundResponse({ description: "Appointment not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointmentsService.getCustomerAppointment(auth, appointmentId);
  }
}

@ApiTags("appointments v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships/:dealershipId/appointments", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("owner", "manager", "staff")
export class DealershipAppointmentsControllerV1 {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({
    summary: "Search a dealership appointment schedule",
    description:
      "Searches appointment starts in the half-open [from, to) interval. Requires active membership in the selected dealership.",
  })
  @ApiParam({ name: "dealershipId", format: "uuid" })
  @ApiQuery({
    name: "from",
    required: true,
    example: "2026-10-20T00:00:00.000Z",
  })
  @ApiQuery({
    name: "to",
    required: true,
    example: "2026-10-21T00:00:00.000Z",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["confirmed", "cancelled", "completed", "no_show"],
  })
  @ApiQuery({
    name: "customerId",
    required: false,
    format: "uuid",
    description: "Optional dealership-scoped customer filter.",
  })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiQuery({ name: "offset", required: false, example: 0 })
  @ApiOkResponse({ description: "Appointments and pagination metadata." })
  @ApiBadRequestResponse({ description: "Invalid filters or time range." })
  @ApiForbiddenResponse({ description: "Dealership membership is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Query() query: DealershipAppointmentListQueryDto,
  ) {
    return this.appointmentsService.listDealershipAppointments(
      auth,
      dealershipId,
      query,
    );
  }

  @Get(":appointmentId")
  @ApiOperation({
    summary: "Read one appointment in a dealership",
    description:
      "Returns appointment details only for active members of the appointment's dealership.",
  })
  @ApiParam({ name: "dealershipId", format: "uuid" })
  @ApiParam({ name: "appointmentId", format: "uuid" })
  @ApiOkResponse({ description: "Appointment details." })
  @ApiForbiddenResponse({ description: "Dealership membership is required." })
  @ApiNotFoundResponse({ description: "Appointment not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointmentsService.getDealershipAppointment(
      auth,
      dealershipId,
      appointmentId,
    );
  }
}

@ApiTags("appointments v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "appointments", version: "1" })
@UseGuards(AuthGuard)
export class AppointmentLifecycleControllerV1 {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post(":appointmentId/cancel")
  @HttpCode(HttpStatus.OK)
  @AuthRoles("customer", "owner", "manager", "staff")
  @ApiOperation({
    summary: "Cancel a confirmed appointment",
    description:
      "Customers may cancel their own appointments; dealership members may cancel appointments in their dealership. Only confirmed appointments that have not started can be cancelled.",
  })
  @ApiParam({ name: "appointmentId", format: "uuid" })
  @ApiOkResponse({ description: "Cancelled appointment." })
  @ApiConflictResponse({ description: "Appointment cannot be cancelled." })
  @ApiNotFoundResponse({ description: "Appointment not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointmentsService.cancelAppointment(auth, appointmentId);
  }

  @Post(":appointmentId/reschedule")
  @HttpCode(HttpStatus.OK)
  @AuthRoles("customer", "owner", "manager", "staff")
  @ApiOperation({
    summary: "Reschedule a confirmed appointment",
    description:
      "Customers may reschedule their own appointments; dealership members may reschedule appointments in their dealership. Revalidates the schedule and reallocates both resources atomically; the original appointment remains unchanged on failure.",
  })
  @ApiParam({ name: "appointmentId", format: "uuid" })
  @ApiBody({
    type: RescheduleAppointmentDto,
    examples: {
      default: { value: { startsAt: "2026-10-21T16:00:00.000Z" } },
    },
  })
  @ApiOkResponse({ description: "Rescheduled appointment." })
  @ApiBadRequestResponse({ description: "Invalid start time." })
  @ApiConflictResponse({ description: "New interval is unavailable." })
  @ApiNotFoundResponse({ description: "Appointment not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  reschedule(
    @CurrentAuth() auth: AuthContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.rescheduleAppointment(
      auth,
      appointmentId,
      body,
    );
  }

  @Patch(":appointmentId/status")
  @AuthRoles("owner", "manager", "staff")
  @ApiOperation({
    summary: "Mark an appointment completed or no-show",
    description:
      "Any dealership member may update an appointment in their dealership. A no-show can be recorded only after the start; completion only after the scheduled end.",
  })
  @ApiParam({ name: "appointmentId", format: "uuid" })
  @ApiBody({
    type: UpdateAppointmentStatusDto,
    examples: {
      completed: { value: { status: "completed" } },
      noShow: { value: { status: "no_show" } },
    },
  })
  @ApiOkResponse({ description: "Updated appointment." })
  @ApiBadRequestResponse({
    description: "Only completed or no_show is allowed.",
  })
  @ApiConflictResponse({
    description: "Appointment is not ready for this status.",
  })
  @ApiForbiddenResponse({ description: "Dealership membership is required." })
  @ApiNotFoundResponse({ description: "Appointment not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateStatus(
    @CurrentAuth() auth: AuthContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateAppointmentStatus(
      auth,
      appointmentId,
      body.status,
    );
  }
}
