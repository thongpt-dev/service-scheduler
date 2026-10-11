import type { DealershipMembershipRole } from "../database/schema";

export interface AuthMembership {
  dealershipId: string;
  role: DealershipMembershipRole;
}

export interface AuthCustomer {
  id: string;
  emailVerifiedAt: Date | null;
}

export type PrincipalRole = "customer" | "staff" | "manager" | "owner";

export interface AuthContext {
  userId: string;
  sessionId: string;
  customer: AuthCustomer | null;
  memberships: AuthMembership[];
  principalRoles: PrincipalRole[];
}

export interface AuthenticatedRequest {
  auth?: AuthContext;
}

export interface RegisterCustomerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProvisionStaffInput {
  dealershipId: string;
  email: string;
  password: string;
  role: DealershipMembershipRole;
}
