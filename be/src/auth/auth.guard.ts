import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { AUTH_ROLES_KEY } from "./auth-roles.decorator";
import type { AuthenticatedRequest, PrincipalRole } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = bearerMatch[1].trim();
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const auth = await this.authService.authenticateBearerToken(token);
    const requiredRoles = this.reflector.getAllAndOverride<PrincipalRole[]>(
      AUTH_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      requiredRoles?.length &&
      !this.authService.hasAnyPrincipalRole(auth, requiredRoles)
    ) {
      throw new ForbiddenException("Missing required role");
    }

    request.auth = auth;
    return true;
  }
}
