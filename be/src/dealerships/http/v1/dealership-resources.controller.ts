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
  CreateDealershipClosureDto,
  CreateDealershipHoursDto,
  UpdateDealershipClosureDto,
  UpdateDealershipHoursDto,
} from "../../dto/dealership-schedule.dto";
import { DealershipsService } from "../../dealerships.service";

@ApiTags("dealership schedules v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class DealershipResourcesControllerV1 {
  constructor(private readonly dealershipsService: DealershipsService) {}

  @Get(":dealershipId/hours")
  @ApiOperation({ summary: "List a dealership's weekly operating hours" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Operating hours returned by day of week." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listHours(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.dealershipsService.listHours(auth, dealershipId);
  }

  @Post(":dealershipId/hours")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a weekly operating-hours entry" })
  @ApiBadRequestResponse({
    description: "Path parameters and schedule must be valid.",
  })
  @ApiBody({
    type: CreateDealershipHoursDto,
    examples: {
      weekday: {
        value: {
          dayOfWeek: 1,
          openTime: "08:00:00",
          closeTime: "17:00:00",
        },
      },
      closedDay: { value: { dayOfWeek: 0, isClosed: true } },
    },
  })
  @ApiCreatedResponse({ description: "Operating hours entry created." })
  @ApiBadRequestResponse({
    description: "Malformed UUID, invalid day, or invalid time window.",
  })
  @ApiConflictResponse({ description: "Hours already exist for that day." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createHour(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Body() body: CreateDealershipHoursDto,
  ) {
    return this.dealershipsService.createHour(auth, dealershipId, body);
  }

  @Patch(":dealershipId/hours/:hourId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update a weekly operating-hours entry" })
  @ApiBadRequestResponse({
    description: "Path parameters and schedule must be valid.",
  })
  @ApiBody({ type: UpdateDealershipHoursDto })
  @ApiOkResponse({ description: "Operating hours entry updated." })
  @ApiBadRequestResponse({
    description: "Malformed UUID, invalid day, or invalid time window.",
  })
  @ApiConflictResponse({ description: "Hours already exist for that day." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Operating-hours entry not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateHour(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("hourId", ParseUUIDPipe) hourId: string,
    @Body() body: UpdateDealershipHoursDto,
  ) {
    return this.dealershipsService.updateHour(auth, dealershipId, hourId, body);
  }

  @Get(":dealershipId/closures")
  @ApiOperation({ summary: "List dated dealership closure periods" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Closure periods returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listClosures(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.dealershipsService.listClosures(auth, dealershipId);
  }

  @Post(":dealershipId/closures")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a dated dealership closure period" })
  @ApiBadRequestResponse({
    description: "Path parameters and closure window must be valid.",
  })
  @ApiBody({
    type: CreateDealershipClosureDto,
    examples: {
      holiday: {
        value: {
          startsAt: "2026-12-25T00:00:00.000Z",
          endsAt: "2026-12-26T00:00:00.000Z",
          reason: "Holiday closure",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Closure period created." })
  @ApiBadRequestResponse({
    description: "Malformed UUID or closure end is not after start.",
  })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createClosure(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Body() body: CreateDealershipClosureDto,
  ) {
    return this.dealershipsService.createClosure(auth, dealershipId, body);
  }

  @Patch(":dealershipId/closures/:closureId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update a dated dealership closure period" })
  @ApiBadRequestResponse({
    description: "Path parameters and closure window must be valid.",
  })
  @ApiBody({ type: UpdateDealershipClosureDto })
  @ApiOkResponse({ description: "Closure period updated." })
  @ApiBadRequestResponse({
    description: "Malformed UUID or closure end is not after start.",
  })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Closure period not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateClosure(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("closureId", ParseUUIDPipe) closureId: string,
    @Body() body: UpdateDealershipClosureDto,
  ) {
    return this.dealershipsService.updateClosure(
      auth,
      dealershipId,
      closureId,
      body,
    );
  }

  @Delete(":dealershipId/closures/:closureId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Remove a dealership closure period" })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiOkResponse({ description: "Closure period removed." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Closure period not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  deleteClosure(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("closureId", ParseUUIDPipe) closureId: string,
  ) {
    return this.dealershipsService.deleteClosure(auth, dealershipId, closureId);
  }
}
