import { SetMetadata } from "@nestjs/common";
import type { PrincipalRole } from "./auth.types";

export const AUTH_ROLES_KEY = "auth:roles";
export const AuthRoles = (...roles: PrincipalRole[]) =>
  SetMetadata(AUTH_ROLES_KEY, roles);
