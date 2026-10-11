import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
  CreateDealershipDto,
  UpdateDealershipDto,
} from "../../dto/dealership.dto";
import { DealershipsService } from "../../dealerships.service";

@ApiTags("dealerships v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "dealerships", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer", "staff")
export class DealershipsControllerV1 {
  constructor(private readonly dealershipsService: DealershipsService) {}

  @Get()
  @ApiOperation({ summary: "List active dealerships" })
  @ApiOkResponse({ description: "Active dealerships returned." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list() {
    return this.dealershipsService.list();
  }

  @Get(":dealershipId")
  @ApiOperation({ summary: "Get an active dealership" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Dealership returned." })
  @ApiNotFoundResponse({ description: "Dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  getById(@Param("dealershipId", ParseUUIDPipe) dealershipId: string) {
    return this.dealershipsService.getById(dealershipId);
  }

  @Post()
  @ApiOperation({
    summary: "Create a dealership and make the caller its first owner",
    description:
      "Any authenticated customer or staff account may create a dealership. Dealership and owner membership are created atomically.",
  })
  @ApiBody({
    type: CreateDealershipDto,
    examples: {
      default: {
        value: {
          name: "North Valley Service Center",
          addressLine1: "100 Service Road",
          city: "Springfield",
          region: "CA",
          postalCode: "90000",
          countryCode: "US",
          timezone: "America/Los_Angeles",
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Dealership created; caller assigned owner role.",
  })
  @ApiForbiddenResponse({ description: "Authenticated account is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  create(@CurrentAuth() auth: AuthContext, @Body() body: CreateDealershipDto) {
    return this.dealershipsService.create(auth, body);
  }

  @Patch(":dealershipId")
  @ApiOperation({ summary: "Update dealership details (owner only)" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiBody({ type: UpdateDealershipDto })
  @ApiOkResponse({ description: "Dealership updated." })
  @ApiForbiddenResponse({
    description: "Caller is not this dealership's owner.",
  })
  @ApiNotFoundResponse({ description: "Dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
    @Body() body: UpdateDealershipDto,
  ) {
    return this.dealershipsService.update(auth, dealershipId, body);
  }

  @Get(":dealershipId/memberships")
  @AuthRoles("manager", "owner")
  @ApiOperation({ summary: "List dealership memberships" })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Dealership membership roles returned." })
  @ApiForbiddenResponse({
    description: "Owner or manager membership in this dealership is required.",
  })
  @ApiNotFoundResponse({ description: "Dealership not found." })
  listMemberships(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.dealershipsService.listMemberships(auth, dealershipId);
  }
}

@ApiTags("customer dealerships v1")
@ApiBearerAuth("bearer-auth")
@Controller({ path: "customers/me/dealerships", version: "1" })
@UseGuards(AuthGuard)
@AuthRoles("customer")
export class CustomerDealershipsControllerV1 {
  constructor(private readonly dealershipsService: DealershipsService) {}

  @Get()
  @ApiOperation({ summary: "List dealerships linked to the current customer" })
  @ApiOkResponse({ description: "Active associated dealerships returned." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  list(@CurrentAuth() auth: AuthContext) {
    return this.dealershipsService.listForCustomer(auth);
  }

  @Put(":dealershipId")
  @ApiOperation({
    summary: "Associate the current customer with a dealership",
    description:
      "The customer opts in to the dealership association. Repeating the request is safe.",
  })
  @ApiBadRequestResponse({ description: "dealershipId must be a UUID." })
  @ApiOkResponse({ description: "Customer is associated with the dealership." })
  @ApiForbiddenResponse({ description: "Customer profile is required." })
  @ApiNotFoundResponse({ description: "Active dealership not found." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  associate(
    @CurrentAuth() auth: AuthContext,
    @Param("dealershipId", ParseUUIDPipe) dealershipId: string,
  ) {
    return this.dealershipsService.associateCustomer(auth, dealershipId);
  }
}
