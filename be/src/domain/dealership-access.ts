import { ForbiddenException } from "@nestjs/common";
import type { AuthContext } from "../auth/auth.types";
import type { DealershipMembershipRole } from "../database/schema";

export function requireDealershipRole(
  auth: AuthContext,
  dealershipId: string,
  allowedRoles: DealershipMembershipRole[],
): void {
  const allowed = auth.memberships.some(
    (membership) =>
      membership.dealershipId === dealershipId &&
      allowedRoles.includes(membership.role),
  );
  if (!allowed) {
    throw new ForbiddenException("No access to this dealership");
  }
}

export function requireAnyDealershipRole(
  auth: AuthContext,
  allowedRoles: DealershipMembershipRole[],
): void {
  if (!auth.memberships.some(({ role }) => allowedRoles.includes(role))) {
    throw new ForbiddenException("Dealership membership is required");
  }
}
