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
  CreateServiceBayCapabilityDto,
  CreateServiceBayDto,
  UpdateServiceBayDto,
} from "../../dto/service-bay.dto";
import { ServiceBaysService } from "../../service-bays.service";

@ApiTags("service bays v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships/:dealershipId/service-bays", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class ServiceBaysControllerV1 {
  constructor(private readonly serviceBaysService: ServiceBaysService) {}

  @Get()
  @ApiOperation({ summary: "List service bays for a dealership" })
  @ApiOkResponse({ description: "Service bays returned." })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.serviceBaysService.listByDealership(auth, dealershipId);
  }

  @Post()
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Create a service bay" })
  @ApiBody({
    type: CreateServiceBayDto,
    examples: { default: { value: { bayCode: "BAY-03" } } },
  })
  @ApiCreatedResponse({ description: "Service bay created." })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiConflictResponse({ description: "Bay code already exists." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Body() body: CreateServiceBayDto,
  ) {
    return this.serviceBaysService.create(auth, dealershipId, body);
  }

  @Patch(":serviceBayId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update or deactivate a service bay" })
  @ApiBody({ type: UpdateServiceBayDto })
  @ApiOkResponse({ description: "Service bay updated." })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiConflictResponse({ description: "Bay code already exists." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Service bay not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("serviceBayId", ParseUUIDPipe) serviceBayId: string,
    @Body() body: UpdateServiceBayDto,
  ) {
    return this.serviceBaysService.update(
      auth,
      dealershipId,
      serviceBayId,
      body,
    );
  }

  @Get(":serviceBayId/capabilities")
  @ApiOperation({ summary: "List service types supported by a bay" })
  @ApiOkResponse({ description: "Bay service capabilities returned." })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Service bay not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  listCapabilities(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("serviceBayId", ParseUUIDPipe) serviceBayId: string,
  ) {
    return this.serviceBaysService.listCapabilities(
      auth,
      dealershipId,
      serviceBayId,
    );
  }

  @Post(":serviceBayId/capabilities")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Add a service type capability to a bay" })
  @ApiBody({
    type: CreateServiceBayCapabilityDto,
    examples: {
      default: {
        value: { serviceTypeId: "22222222-2222-4222-8222-222222222222" },
      },
    },
  })
  @ApiCreatedResponse({ description: "Service bay capability added." })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiConflictResponse({ description: "Capability already exists." })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Bay or active service type not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  createCapability(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("serviceBayId", ParseUUIDPipe) serviceBayId: string,
    @Body() body: CreateServiceBayCapabilityDto,
  ) {
    return this.serviceBaysService.createCapability(
      auth,
      dealershipId,
      serviceBayId,
      body,
    );
  }

  @Delete(":serviceBayId/capabilities/:serviceTypeId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Remove a service type capability from a bay" })
  @ApiOkResponse({ description: "Service bay capability removed." })
  @ApiBadRequestResponse({ description: "Path parameters must be UUIDs." })
  @ApiConflictResponse({
    description: "Appointment history references this capability.",
  })
  @ApiForbiddenResponse({ description: "Owner or manager access required." })
  @ApiNotFoundResponse({ description: "Service bay capability not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  deleteCapability(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Param("serviceBayId", ParseUUIDPipe) serviceBayId: string,
    @Param("serviceTypeId", ParseUUIDPipe) serviceTypeId: string,
  ) {
    return this.serviceBaysService.deleteCapability(
      auth,
      dealershipId,
      serviceBayId,
      serviceTypeId,
    );
  }
}
