import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard } from "../../../auth/auth.guard";
import { AuthRoles } from "../../../auth/auth-roles.decorator";
import { CurrentAuth } from "../../../auth/current-auth.decorator";
import type { AuthContext } from "../../../auth/auth.types";
import {
  CreateTechnicianDto,
  CreateTechnicianLeaveDto,
  CreateTechnicianQualificationDto,
  CreateTechnicianShiftDto,
  UpdateTechnicianDto,
  UpdateTechnicianLeaveDto,
  UpdateTechnicianQualificationDto,
  UpdateTechnicianShiftDto,
} from "../../dto/technician.dto";
import { TechniciansService } from "../../technicians.service";

@ApiTags("technicians v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships/:dealershipId/technicians", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class TechniciansControllerV1 {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Get()
  @ApiOperation({ summary: "List technicians for a dealership" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Technicians returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.techniciansService.listByDealership(auth, dealershipId);
  }

  @Post()
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a dealership technician" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiBody({
    type: CreateTechnicianDto,
    examples: {
      default: {
        value: { displayName: "Alex Technician", employeeCode: "TECH-010" },
      },
    },
  })
  @ApiCreatedResponse({ description: "Technician created." })
  @ApiConflictResponse({ description: "Employee code is already in use." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Body() body: CreateTechnicianDto,
  ) {
    return this.techniciansService.create(auth, dealershipId, body);
  }

  @Patch(":technicianId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update or deactivate a technician" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiBody({ type: UpdateTechnicianDto })
  @ApiOkResponse({ description: "Technician updated." })
  @ApiConflictResponse({ description: "Employee code is already in use." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Body() body: UpdateTechnicianDto,
  ) {
    return this.techniciansService.update(
      auth,
      dealershipId,
      technicianId,
      body,
    );
  }

  @Get(":technicianId/qualifications")
  @ApiOperation({ summary: "List a technician's service qualifications" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Qualifications returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listQualifications(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
  ) {
    return this.techniciansService.listQualifications(
      auth,
      dealershipId,
      technicianId,
    );
  }

  @Post(":technicianId/qualifications")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Assign a service qualification to a technician" })
  @ApiBadRequestResponse({
    description:
      "Path and request identifiers must be UUIDs; qualification validity window must be valid.",
  })
  @ApiBody({
    type: CreateTechnicianQualificationDto,
    examples: {
      certified: {
        value: {
          serviceTypeId: "22222222-2222-4222-8222-222222222222",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: "2027-01-01T00:00:00.000Z",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Qualification assigned." })
  @ApiConflictResponse({ description: "Qualification already exists." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician or service type not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createQualification(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Body() body: CreateTechnicianQualificationDto,
  ) {
    return this.techniciansService.createQualification(
      auth,
      dealershipId,
      technicianId,
      body,
    );
  }

  @Patch(":technicianId/qualifications/:serviceTypeId")
  @AuthRoles("manager", "owner")
  @ApiOperation({
    summary: "Update a technician qualification validity window",
  })
  @ApiBadRequestResponse({
    description:
      "Path parameters must be UUIDs; qualification validity window must be valid.",
  })
  @ApiBody({ type: UpdateTechnicianQualificationDto })
  @ApiOkResponse({ description: "Qualification validity updated." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Qualification not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateQualification(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Param("serviceTypeId", ParseUUIDPipe) serviceTypeId: string,
    @Body() body: UpdateTechnicianQualificationDto,
  ) {
    return this.techniciansService.updateQualification(
      auth,
      dealershipId,
      technicianId,
      serviceTypeId,
      body,
    );
  }

  @Delete(":technicianId/qualifications/:serviceTypeId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Remove a technician qualification" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Qualification removed." })
  @ApiConflictResponse({
    description: "Appointment history references this qualification.",
  })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Qualification not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  deleteQualification(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Param("serviceTypeId", ParseUUIDPipe) serviceTypeId: string,
  ) {
    return this.techniciansService.deleteQualification(
      auth,
      dealershipId,
      technicianId,
      serviceTypeId,
    );
  }

  @Get(":technicianId/shifts")
  @ApiOperation({ summary: "List a technician's weekly shifts" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Weekly shifts returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listShifts(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
  ) {
    return this.techniciansService.listShifts(auth, dealershipId, technicianId);
  }

  @Post(":technicianId/shifts")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a technician's weekly shift" })
  @ApiBadRequestResponse({
    description: "Path parameters and shift window must be valid.",
  })
  @ApiBody({
    type: CreateTechnicianShiftDto,
    examples: {
      weekday: {
        value: {
          dayOfWeek: 1,
          startLocalTime: "08:00:00",
          endLocalTime: "17:00:00",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Technician shift created." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createShift(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Body() body: CreateTechnicianShiftDto,
  ) {
    return this.techniciansService.createShift(
      auth,
      dealershipId,
      technicianId,
      body,
    );
  }

  @Patch(":technicianId/shifts/:shiftId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update or deactivate a technician's shift" })
  @ApiBadRequestResponse({
    description: "Path parameters and shift window must be valid.",
  })
  @ApiBody({ type: UpdateTechnicianShiftDto })
  @ApiOkResponse({ description: "Technician shift updated." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician shift not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateShift(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
    @Body() body: UpdateTechnicianShiftDto,
  ) {
    return this.techniciansService.updateShift(
      auth,
      dealershipId,
      technicianId,
      shiftId,
      body,
    );
  }

  @Get(":technicianId/leaves")
  @ApiOperation({ summary: "List a technician's dated leave periods" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Leave periods returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listLeaves(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
  ) {
    return this.techniciansService.listLeaves(auth, dealershipId, technicianId);
  }

  @Post(":technicianId/leaves")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a technician leave period" })
  @ApiBadRequestResponse({
    description: "Path parameters and leave window must be valid.",
  })
  @ApiBody({
    type: CreateTechnicianLeaveDto,
    examples: {
      leave: {
        value: {
          startsAt: "2026-11-04T08:00:00.000Z",
          endsAt: "2026-11-04T17:00:00.000Z",
          reason: "Annual leave",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Technician leave created." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createLeave(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Body() body: CreateTechnicianLeaveDto,
  ) {
    return this.techniciansService.createLeave(
      auth,
      dealershipId,
      technicianId,
      body,
    );
  }

  @Patch(":technicianId/leaves/:leaveId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update a technician leave period" })
  @ApiBadRequestResponse({
    description: "Path parameters and leave window must be valid.",
  })
  @ApiBody({ type: UpdateTechnicianLeaveDto })
  @ApiOkResponse({ description: "Technician leave updated." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician leave not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateLeave(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Param("leaveId", ParseUUIDPipe) leaveId: string,
    @Body() body: UpdateTechnicianLeaveDto,
  ) {
    return this.techniciansService.updateLeave(
      auth,
      dealershipId,
      technicianId,
      leaveId,
      body,
    );
  }

  @Delete(":technicianId/leaves/:leaveId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Remove a technician leave period" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Technician leave removed." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Technician leave not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  deleteLeave(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("technicianId", ParseUUIDPipe) technicianId: string,
    @Param("leaveId", ParseUUIDPipe) leaveId: string,
  ) {
    return this.techniciansService.deleteLeave(
      auth,
      dealershipId,
      technicianId,
      leaveId,
    );
  }
}
