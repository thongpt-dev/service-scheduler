import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Response } from "express";
import {
  refreshTokenCookieName,
  refreshTokenCookiePath,
} from "../../auth.constants";
import { AuthGuard } from "../../auth.guard";
import { AuthRoles } from "../../auth-roles.decorator";
import { AuthService } from "../../auth.service";
import { CurrentAuth } from "../../current-auth.decorator";
import type { AuthContext } from "../../auth.types";
import type { IssuedToken } from "../../token.types";
import { LoginDto } from "./dto/login.dto";
import { ProvisionStaffDto } from "./dto/provision-staff.dto";
import { RegisterCustomerDto } from "./dto/register-customer.dto";

@ApiTags("auth v1")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(response: Response, issued: IssuedToken): void {
    response.cookie(refreshTokenCookieName, issued.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: refreshTokenCookiePath,
      maxAge: issued.refreshTokenExpiresIn * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(refreshTokenCookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: refreshTokenCookiePath,
    });
  }

  private accessTokenResponse(issued: IssuedToken) {
    return {
      accessToken: issued.accessToken,
      tokenType: issued.tokenType,
      expiresIn: issued.expiresIn,
    };
  }

  @Post("customers/register")
  @ApiOperation({
    summary: "Register a customer account",
    description:
      "Creates a password account and either creates a customer profile or links an active, unlinked profile with the same normalized email. Existing profile details are preserved. Email remains unverified; because email verification is not implemented, matching an unlinked profile is claimed based on the submitted email.",
  })
  @ApiBody({
    type: RegisterCustomerDto,
    examples: {
      customer: {
        value: {
          email: "customer@example.test",
          password: "A-long-local-password-123",
          firstName: "Jamie",
          lastName: "Customer",
          phone: "+12025550123",
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Customer account created and access token issued.",
    schema: {
      example: {
        accessToken: "<signed-jwt>",
        tokenType: "Bearer",
        expiresIn: 1800,
        customerId: "6f57aa38-1dc5-4b52-9b18-aead80f04ba1",
        emailVerified: false,
      },
    },
  })
  @ApiBadRequestResponse({ description: "Invalid registration input." })
  @ApiConflictResponse({
    description: "Account could not be created with those details.",
  })
  async registerCustomer(
    @Body() body: RegisterCustomerDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.authService.registerCustomer(body);
    this.setRefreshCookie(response, issued);
    return {
      ...this.accessTokenResponse(issued),
      customerId: issued.customerId,
      emailVerified: issued.emailVerified,
    };
  }

  @Post("customers/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in a customer",
    description:
      "Authenticates by email and password. Unverified customer accounts may sign in during the MVP.",
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      customer: {
        value: {
          email: "customer@example.test",
          password: "A-long-local-password-123",
        },
      },
    },
  })
  @ApiOkResponse({
    description: "Access token issued.",
    schema: {
      example: {
        accessToken: "<signed-jwt>",
        tokenType: "Bearer",
        expiresIn: 1800,
      },
    },
  })
  @ApiBadRequestResponse({ description: "Invalid login input." })
  @ApiUnauthorizedResponse({ description: "Invalid credentials." })
  async customerLogin(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.authService.customerLogin(body);
    this.setRefreshCookie(response, issued);
    return this.accessTokenResponse(issued);
  }

  @Post("staff/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in dealership staff",
    description:
      "Authenticates by email and password and requires at least one active dealership membership.",
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      staff: {
        value: {
          email: "advisor@example.test",
          password: "A-long-local-password-123",
        },
      },
    },
  })
  @ApiOkResponse({
    description: "Access token issued.",
    schema: {
      example: {
        accessToken: "<signed-jwt>",
        tokenType: "Bearer",
        expiresIn: 1800,
      },
    },
  })
  @ApiBadRequestResponse({ description: "Invalid login input." })
  @ApiUnauthorizedResponse({ description: "Invalid credentials." })
  @ApiForbiddenResponse({ description: "No active dealership membership." })
  async staffLogin(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.authService.staffLogin(body);
    this.setRefreshCookie(response, issued);
    return this.accessTokenResponse(issued);
  }

  @Post("staff/provision")
  @UseGuards(AuthGuard)
  @AuthRoles("manager", "owner")
  @ApiBearerAuth("bearer-auth")
  @ApiOperation({
    summary: "Provision an account for dealership staff",
    description:
      "Creates a new unverified password account and dealership membership. Owners may assign any dealership role; managers may provision staff only. Existing accounts are not overwritten or attached to another dealership.",
  })
  @ApiBody({
    type: ProvisionStaffDto,
    examples: {
      staff: {
        value: {
          dealershipId: "d3da5c9c-7be1-4cf8-91cf-f53ff4185c34",
          email: "advisor@example.test",
          password: "A-long-local-password-123",
          role: "staff",
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Staff account and membership created.",
    schema: {
      example: { staffUserId: "2372954d-f44c-4c7d-b0ca-6dadfbb3d44f" },
    },
  })
  @ApiBadRequestResponse({ description: "Invalid provisioning input." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  @ApiForbiddenResponse({
    description: "Caller lacks the required role in the requested dealership.",
  })
  @ApiConflictResponse({
    description: "Account could not be provisioned with those details.",
  })
  provisionStaff(
    @CurrentAuth() auth: AuthContext,
    @Body() body: ProvisionStaffDto,
  ) {
    return this.authService.provisionStaff(auth, body);
  }

  @Post("tokens/revoke-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @AuthRoles("customer", "staff", "manager", "owner")
  @ApiBearerAuth("bearer-auth")
  @ApiOperation({
    summary: "Revoke all access tokens for the current user",
    description:
      "Increments the user's token version, invalidating all previously issued access tokens, including this one.",
  })
  @ApiOkResponse({
    description: "All previously issued access tokens are revoked.",
    schema: { example: { revoked: true } },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token." })
  async revokeAllTokens(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.revokeAllTokens(auth);
    this.clearRefreshCookie(response);
    return result;
  }

  @Post("tokens/refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rotate the refresh token and issue a new access token",
    description:
      "Reads the opaque refresh token from the HttpOnly cookie, invalidates it, and returns a new access token and rotated cookie. Reuse of a rotated token revokes its token family.",
  })
  @ApiOkResponse({
    description:
      "A new access token is issued and the refresh cookie is rotated.",
    schema: {
      example: {
        accessToken: "<signed-jwt>",
        tokenType: "Bearer",
        expiresIn: 1800,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: "Missing, expired, revoked, or reused refresh token.",
  })
  async refreshToken(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const cookies: Record<string, string> = parse(cookieHeader ?? "");
      const refreshToken: string | undefined = cookies[refreshTokenCookieName];
      const issued: IssuedToken =
        await this.authService.refreshAccessToken(refreshToken);
      this.setRefreshCookie(response, issued);
      return this.accessTokenResponse(issued);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.clearRefreshCookie(response);
      }
      throw error;
    }
  }
}
