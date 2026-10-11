import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
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
  CreateDealershipServiceDto,
  CreateServiceTypeDto,
  UpdateDealershipServiceDto,
  UpdateServiceTypeDto,
} from "../../dto/service-catalog.dto";
import { ServiceCatalogService } from "../../service-catalog.service";

@ApiTags("service catalog v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "service-types", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class ServiceTypesControllerV1 {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  @ApiOperation({ summary: "List active shared service types" })
  @ApiOkResponse({ description: "Active service types returned." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list() {
    return this.serviceCatalogService.listServiceTypes();
  }

  @Post()
  @AuthRoles("manager", "owner")
  @ApiOperation({
    summary: "Add a shared service type",
    description:
      "Service types are shared catalog definitions. A manager or owner with an active dealership membership may add a definition; dealership availability is controlled by separate offerings.",
  })
  @ApiBody({
    type: CreateServiceTypeDto,
    examples: {
      maintenance: {
        value: {
          name: "Standard Maintenance",
          description: "Routine inspection and maintenance service.",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Shared service type created." })
  @ApiConflictResponse({ description: "Service type name is already in use." })
  @ApiForbiddenResponse({
    description: "Manager or owner membership is required.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(@CurrentAuth() auth: AuthContext, @Body() body: CreateServiceTypeDto) {
    return this.serviceCatalogService.createServiceType(auth, body);
  }

  @Patch(":serviceTypeId")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Update a shared service type" })
  @ApiBody({ type: UpdateServiceTypeDto })
  @ApiOkResponse({ description: "Service type updated." })
  @ApiForbiddenResponse({
    description: "Manager or owner membership is required.",
  })
  @ApiNotFoundResponse({ description: "Service type not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("serviceTypeId") serviceTypeId: string,
    @Body() body: UpdateServiceTypeDto,
  ) {
    return this.serviceCatalogService.updateServiceType(
      auth,
      serviceTypeId,
      body,
    );
  }
}

@ApiTags("dealership services v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships/:dealershipId/services", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class DealershipServicesControllerV1 {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  @ApiOperation({ summary: "List active services offered by a dealership" })
  @ApiOkResponse({ description: "Dealership service offerings returned." })
  @ApiNotFoundResponse({ description: "Dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(@Param("dealershipId") dealershipId: string) {
    return this.serviceCatalogService.listDealershipServices(dealershipId);
  }

  @Post()
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "Configure a service offering for a dealership" })
  @ApiBody({
    type: CreateDealershipServiceDto,
    examples: {
      maintenance: {
        value: {
          serviceTypeId: "22222222-2222-4222-8222-222222222222",
          durationMinutes: 60,
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Dealership service offering created." })
  @ApiConflictResponse({ description: "Service is already offered." })
  @ApiForbiddenResponse({
    description: "Manager/owner access to this dealership is required.",
  })
  @ApiNotFoundResponse({
    description: "Dealership or active service type not found.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Body() body: CreateDealershipServiceDto,
  ) {
    return this.serviceCatalogService.createDealershipService(
      auth,
      dealershipId,
      body,
    );
  }

  @Patch(":dealershipServiceId")
  @AuthRoles("manager", "owner")
  @ApiOperation({
    summary: "Update or deactivate a dealership service offering",
  })
  @ApiBody({ type: UpdateDealershipServiceDto })
  @ApiOkResponse({ description: "Dealership service offering updated." })
  @ApiForbiddenResponse({
    description: "Manager/owner access to this dealership is required.",
  })
  @ApiNotFoundResponse({
    description: "Dealership service offering not found.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("dealershipServiceId") dealershipServiceId: string,
    @Body() body: UpdateDealershipServiceDto,
  ) {
    return this.serviceCatalogService.updateDealershipService(
      auth,
      dealershipId,
      dealershipServiceId,
      body,
    );
  }
}
