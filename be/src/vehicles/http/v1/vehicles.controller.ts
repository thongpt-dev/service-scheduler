import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  CreateVehicleDto,
  GrantVehicleAccessDto,
  UpdateVehicleDto,
} from "../../dto/vehicle.dto";
import { VehiclesService } from "../../vehicles.service";

@ApiTags("vehicles v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "customers/me/vehicles", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer")
export class CustomerVehiclesControllerV1 {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({
    summary: "List vehicles owned by or shared with the customer",
  })
  @ApiOkResponse({ description: "Authorized customer vehicles returned." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(@CurrentAuth() auth: AuthContext) {
    return this.vehiclesService.listMyVehicles(auth);
  }

  @Put(":vehicleId/dealerships/:dealershipId")
  @ApiOperation({
    summary: "Assign an owned vehicle to a dealership",
    description:
      "The authenticated vehicle owner grants the selected active dealership access to this vehicle. Other vehicles remain private to their owner unless separately assigned.",
  })
  @ApiOkResponse({ description: "Vehicle assigned to dealership." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiNotFoundResponse({
    description: "Vehicle or active dealership not found.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  assignToDealership(
    @CurrentAuth() auth: AuthContext,
    @Param("vehicleId") vehicleId: string,
    @Param("dealershipId") dealershipId: string,
  ) {
    return this.vehiclesService.assignOwnedVehicleToDealership(
      auth,
      vehicleId,
      dealershipId,
    );
  }
}

@ApiTags("dealership vehicles v1")
@ApiBearerAuth("bearer-auth")
@Controller({
  path: "dealerships/:dealershipId/customers/:customerId/vehicles",
  version: "1",
})
@UseGuards(AuthGuard)
@AuthRoles("staff")
export class DealershipCustomerVehiclesControllerV1 {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({
    summary: "List dealership-assigned vehicles accessible to a customer",
    description:
      "Returns only vehicles explicitly assigned to this dealership and owned by or shared with the selected dealership customer. A customer/dealership association by itself does not expose vehicles.",
  })
  @ApiOkResponse({ description: "Customer vehicles returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Customer not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
  ) {
    return this.vehiclesService.listForDealershipCustomer(
      auth,
      dealershipId,
      customerId,
    );
  }

  @Post()
  @ApiOperation({ summary: "Add a vehicle owned by a dealership customer" })
  @ApiBody({
    type: CreateVehicleDto,
    examples: {
      default: {
        value: {
          vin: "1HGCM82633A004355",
          make: "Honda",
          model: "Accord",
          year: 2022,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Vehicle created and linked to customer.",
  })
  @ApiBadRequestResponse({ description: "Invalid vehicle input." })
  @ApiConflictResponse({ description: "VIN is already registered." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Customer not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
    @Body() body: CreateVehicleDto,
  ) {
    return this.vehiclesService.createForCustomer(
      auth,
      dealershipId,
      customerId,
      body,
    );
  }
}

@ApiTags("dealership vehicles v1")
@ApiBearerAuth("bearer-auth")
@Controller({
  path: "dealerships/:dealershipId/vehicles/:vehicleId",
  version: "1",
})
@UseGuards(AuthGuard)
@AuthRoles("staff")
export class DealershipVehicleControllerV1 {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Patch()
  @ApiOperation({
    summary: "Update or deactivate a dealership customer's vehicle",
  })
  @ApiBody({ type: UpdateVehicleDto })
  @ApiOkResponse({ description: "Vehicle updated." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Vehicle not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("vehicleId") vehicleId: string,
    @Body() body: UpdateVehicleDto,
  ) {
    return this.vehiclesService.updateForDealership(
      auth,
      dealershipId,
      vehicleId,
      body,
    );
  }
}

@ApiTags("customer vehicle access v1")
@ApiBearerAuth("bearer-auth")
@Controller({
  path: "dealerships/:dealershipId/customers/:customerId/vehicle-access",
  version: "1",
})
@UseGuards(AuthGuard)
@AuthRoles("staff")
export class CustomerVehicleAccessControllerV1 {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({
    summary: "Grant a dealership customer access to an assigned vehicle",
    description:
      "The vehicle must already be assigned to this dealership. This grants customer access to the vehicle; dealership vehicle visibility is governed separately by the dealership assignment.",
  })
  @ApiBody({
    type: GrantVehicleAccessDto,
    examples: {
      default: { value: { vehicleId: "5019a7ca-4101-41a7-b364-74731f76b0bd" } },
    },
  })
  @ApiCreatedResponse({ description: "Vehicle access granted." })
  @ApiBadRequestResponse({ description: "Vehicle owner already has access." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Customer or vehicle not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  grant(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
    @Body() body: GrantVehicleAccessDto,
  ) {
    return this.vehiclesService.grantAccess(
      auth,
      dealershipId,
      customerId,
      body.vehicleId,
    );
  }

  @Delete(":vehicleId")
  @ApiOperation({ summary: "Revoke a customer's shared-vehicle access" })
  @ApiOkResponse({ description: "Vehicle access revoked." })
  @ApiBadRequestResponse({
    description: "Vehicle ownership cannot be revoked here.",
  })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({
    description: "Customer, vehicle, or access not found.",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vehiclesService.revokeAccess(
      auth,
      dealershipId,
      customerId,
      vehicleId,
    );
  }
}
