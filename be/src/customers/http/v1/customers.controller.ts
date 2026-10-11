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
  CreateCustomerDto,
  UpdateCustomerProfileDto,
} from "../../dto/customer.dto";
import { CustomersService } from "../../customers.service";

@ApiTags("customers v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "customers", version: "1" })
@UseGuards(AuthGuard)
export class CustomerProfileControllerV1 {
  constructor(private readonly customersService: CustomersService) {}

  @Get("me")
  @AuthRoles("customer")
  @ApiOperation({ summary: "Get the authenticated customer's profile" })
  @ApiOkResponse({ description: "Customer profile returned." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  getMe(@CurrentAuth() auth: AuthContext) {
    return this.customersService.getMe(auth);
  }

  @Patch("me")
  @AuthRoles("customer")
  @ApiOperation({ summary: "Update the authenticated customer's profile" })
  @ApiBody({
    type: UpdateCustomerProfileDto,
    examples: {
      default: { value: { firstName: "Jamie", phone: "+12025550123" } },
    },
  })
  @ApiOkResponse({ description: "Customer profile updated." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body() body: UpdateCustomerProfileDto,
  ) {
    return this.customersService.updateMe(auth, body);
  }
}

@ApiTags("dealership customers v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships/:dealershipId/customers", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("staff")
export class DealershipCustomersControllerV1 {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: "List customers associated with a dealership" })
  @ApiOkResponse({ description: "Dealership customers returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
  ) {
    return this.customersService.listByDealership(auth, dealershipId);
  }

  @Post()
  @ApiOperation({
    summary: "Create a customer profile for a dealership",
    description:
      "Creates an unlinked customer profile and associates it with this dealership. It does not create login credentials or link by matching an existing email.",
  })
  @ApiBody({
    type: CreateCustomerDto,
    examples: {
      default: {
        value: {
          email: "customer@example.test",
          firstName: "Jamie",
          lastName: "Customer",
          phone: "+12025550123",
        },
      },
    },
  })
  @ApiCreatedResponse({ description: "Customer profile created and linked." })
  @ApiConflictResponse({
    description: "An account or customer profile already uses this email.",
  })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Body() body: CreateCustomerDto,
  ) {
    return this.customersService.createForDealership(auth, dealershipId, body);
  }

  @Get(":customerId")
  @ApiOperation({ summary: "Get a dealership-associated customer" })
  @ApiOkResponse({ description: "Customer profile returned." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Customer not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  getById(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
  ) {
    return this.customersService.getForDealership(
      auth,
      dealershipId,
      customerId,
    );
  }

  @Patch(":customerId")
  @ApiOperation({ summary: "Update a dealership-associated customer" })
  @ApiBody({ type: UpdateCustomerProfileDto })
  @ApiOkResponse({ description: "Customer profile updated." })
  @ApiForbiddenResponse({ description: "No access to this dealership." })
  @ApiNotFoundResponse({ description: "Customer not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId") dealershipId: string,
    @Param("customerId") customerId: string,
    @Body() body: UpdateCustomerProfileDto,
  ) {
    return this.customersService.updateForDealership(
      auth,
      dealershipId,
      customerId,
      body,
    );
  }
}
