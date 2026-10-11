import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthContext, AuthenticatedRequest } from "./auth.types";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    if (!request.auth) {
      throw new UnauthorizedException("Missing authenticated principal");
    }

    return request.auth;
  },
);
