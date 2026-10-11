import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { InjectDb, type Database } from "../database/database.types";
import {
  customers,
  dealershipMembershipRoleEnum,
  dealershipMemberships,
  dealerships,
  users,
} from "../database/schema";
import type {
  AuthContext,
  AuthCustomer,
  AuthMembership,
  LoginInput,
  ProvisionStaffInput,
  PrincipalRole,
  RegisterCustomerInput,
} from "./auth.types";
import { hashPassword, normalizeEmail, verifyPassword } from "./security.util";

interface JwtConfiguration {
  secret: string;
  issuer: string;
  audience: string;
  expiresInSeconds: number;
}

interface AccessTokenClaims {
  subject: string;
  tokenVersion: number;
  tokenId: string;
}

export interface IssuedToken {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return databaseErrorCode(error.cause);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async registerCustomer(
    input: RegisterCustomerInput,
  ): Promise<IssuedToken & { customerId: string; emailVerified: false }> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    let userId: string;
    let customerId: string;

    try {
      const created = await this.db.transaction(async (tx) => {
        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser) {
          throw new ConflictException(
            "Account could not be created with those details",
          );
        }

        const [existingCustomer] = await tx
          .select({
            id: customers.id,
            userId: customers.userId,
            isActive: customers.isActive,
          })
          .from(customers)
          .where(eq(customers.email, email))
          .limit(1);
        if (
          existingCustomer &&
          (!existingCustomer.isActive || existingCustomer.userId !== null)
        ) {
          throw new ConflictException(
            "Account could not be created with those details",
          );
        }

        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, emailVerifiedAt: null })
          .returning({ id: users.id });
        if (!user) {
          throw new Error("Customer identity insert returned no row");
        }

        if (existingCustomer) {
          const [linkedCustomer] = await tx
            .update(customers)
            .set({ userId: user.id, updatedAt: new Date() })
            .where(
              and(
                eq(customers.id, existingCustomer.id),
                eq(customers.isActive, true),
                isNull(customers.userId),
              ),
            )
            .returning({ id: customers.id });
          if (!linkedCustomer) {
            throw new ConflictException(
              "Account could not be created with those details",
            );
          }

          return { userId: user.id, customerId: linkedCustomer.id };
        }

        const [customer] = await tx
          .insert(customers)
          .values({
            userId: user.id,
            email,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone?.trim() || null,
          })
          .returning({ id: customers.id });
        if (!customer) {
          throw new Error("Customer profile insert returned no row");
        }

        return { userId: user.id, customerId: customer.id };
      });

      userId = created.userId;
      customerId = created.customerId;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Account could not be created with those details",
        );
      }
      throw error;
    }

    return {
      ...(await this.issueAccessToken(userId)),
      customerId,
      emailVerified: false,
    };
  }

  async customerLogin(input: LoginInput): Promise<IssuedToken> {
    const user = await this.findUserByEmail(input.email);
    if (
      !user ||
      !user.isActive ||
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.userId, user.id), eq(customers.isActive, true)))
      .limit(1);
    if (!customer) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueAccessToken(user.id);
  }

  async staffLogin(input: LoginInput): Promise<IssuedToken> {
    const user = await this.findUserByEmail(input.email);
    if (
      !user ||
      !user.isActive ||
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const memberships = await this.loadMemberships(user.id);
    if (memberships.length === 0) {
      throw new ForbiddenException("No active dealership membership");
    }

    return this.issueAccessToken(user.id);
  }

  async provisionStaff(
    actor: AuthContext,
    input: ProvisionStaffInput,
  ): Promise<{ staffUserId: string }> {
    const actorMembership = actor.memberships.find(
      (membership) => membership.dealershipId === input.dealershipId,
    );
    if (!actorMembership) {
      throw new ForbiddenException("No access to this dealership");
    }

    const isOwner = actorMembership.role === "owner";
    if (!isOwner && actorMembership.role !== "manager") {
      throw new ForbiddenException(
        "Only dealership owners or managers can provision staff",
      );
    }
    if (!isOwner && input.role !== "staff") {
      throw new ForbiddenException(
        "Managers may provision staff accounts only",
      );
    }
    if (!dealershipMembershipRoleEnum.enumValues.includes(input.role)) {
      throw new ForbiddenException("Unsupported dealership role");
    }

    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    try {
      const staffUserId = await this.db.transaction(async (tx) => {
        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser) {
          throw new ConflictException(
            "Account could not be provisioned with those details",
          );
        }

        const [dealership] = await tx
          .select({ id: dealerships.id })
          .from(dealerships)
          .where(
            and(
              eq(dealerships.id, input.dealershipId),
              eq(dealerships.isActive, true),
            ),
          )
          .limit(1);
        if (!dealership) {
          throw new ForbiddenException("No access to this dealership");
        }

        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, emailVerifiedAt: null })
          .returning({ id: users.id });
        if (!user) {
          throw new Error("Staff identity insert returned no row");
        }

        await tx.insert(dealershipMemberships).values({
          dealershipId: input.dealershipId,
          userId: user.id,
          role: input.role,
        });
        return user.id;
      });

      return { staffUserId };
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Account could not be provisioned with those details",
        );
      }
      throw error;
    }
  }

  async revokeAllTokens(actor: AuthContext): Promise<{ revoked: true }> {
    const [user] = await this.db
      .update(users)
      .set({
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, actor.userId), eq(users.isActive, true)))
      .returning({ id: users.id });
    if (!user) {
      throw new UnauthorizedException("User is inactive");
    }

    return { revoked: true };
  }

  async authenticateBearerToken(token: string): Promise<AuthContext> {
    const claims = this.verifyAccessToken(token);
    const [user] = await this.db
      .select({
        id: users.id,
        tokenVersion: users.tokenVersion,
        isActive: users.isActive,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, claims.subject))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (claims.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException("Token has been revoked");
    }

    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.userId, user.id), eq(customers.isActive, true)))
      .limit(1);
    const memberships = await this.loadMemberships(user.id);
    const authCustomer: AuthCustomer | null = customer
      ? { id: customer.id, emailVerifiedAt: user.emailVerifiedAt }
      : null;

    return {
      userId: user.id,
      sessionId: claims.tokenId,
      customer: authCustomer,
      memberships,
      principalRoles: this.buildPrincipalRoles(
        authCustomer !== null,
        memberships,
      ),
    };
  }

  hasAnyPrincipalRole(
    auth: AuthContext,
    requiredRoles: PrincipalRole[],
  ): boolean {
    return requiredRoles.some((role) => auth.principalRoles.includes(role));
  }

  hasDealershipRole(
    auth: AuthContext,
    dealershipId: string,
    allowedRoles: AuthMembership["role"][],
  ): boolean {
    return auth.memberships.some(
      (membership) =>
        membership.dealershipId === dealershipId &&
        allowedRoles.includes(membership.role),
    );
  }

  private async findUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);
    return user;
  }

  private async loadMemberships(userId: string): Promise<AuthMembership[]> {
    const rows = await this.db
      .select({
        dealershipId: dealershipMemberships.dealershipId,
        role: dealershipMemberships.role,
      })
      .from(dealershipMemberships)
      .innerJoin(
        dealerships,
        eq(dealerships.id, dealershipMemberships.dealershipId),
      )
      .where(
        and(
          eq(dealershipMemberships.userId, userId),
          eq(dealershipMemberships.isActive, true),
          eq(dealerships.isActive, true),
        ),
      );

    return rows;
  }

  private async issueAccessToken(userId: string): Promise<IssuedToken> {
    const [user] = await this.db
      .select({
        id: users.id,
        tokenVersion: users.tokenVersion,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const configuration = this.getJwtConfiguration();
    const accessToken = jwt.sign(
      { ver: user.tokenVersion },
      configuration.secret,
      {
        algorithm: "HS256",
        audience: configuration.audience,
        expiresIn: configuration.expiresInSeconds,
        issuer: configuration.issuer,
        jwtid: randomUUID(),
        subject: user.id,
      },
    );

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: configuration.expiresInSeconds,
    };
  }

  private verifyAccessToken(token: string): AccessTokenClaims {
    const configuration = this.getJwtConfiguration();
    try {
      const payload: unknown = jwt.verify(token, configuration.secret, {
        algorithms: ["HS256"],
        audience: configuration.audience,
        issuer: configuration.issuer,
      });
      if (
        !isRecord(payload) ||
        typeof payload.sub !== "string" ||
        typeof payload.jti !== "string" ||
        typeof payload.ver !== "number" ||
        !Number.isInteger(payload.ver)
      ) {
        throw new UnauthorizedException("Invalid bearer token");
      }

      return {
        subject: payload.sub,
        tokenId: payload.jti,
        tokenVersion: payload.ver,
      };
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }

  private getJwtConfiguration(): JwtConfiguration {
    const secret = this.config.get<string>("JWT_SECRET")?.trim();
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw new InternalServerErrorException(
        "JWT_SECRET must contain at least 32 bytes",
      );
    }

    const expiresInSeconds = Number(
      this.config.get<string>("JWT_ACCESS_TOKEN_TTL_SECONDS") ?? "1800",
    );
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 60 ||
      expiresInSeconds > 3600
    ) {
      throw new InternalServerErrorException(
        "JWT_ACCESS_TOKEN_TTL_SECONDS must be between 60 and 3600",
      );
    }

    return {
      secret,
      issuer: this.config.get<string>("JWT_ISSUER") ?? "service-scheduler-api",
      audience:
        this.config.get<string>("JWT_AUDIENCE") ?? "service-scheduler-clients",
      expiresInSeconds,
    };
  }

  private buildPrincipalRoles(
    hasCustomerProfile: boolean,
    memberships: AuthMembership[],
  ): PrincipalRole[] {
    const roles = new Set<PrincipalRole>();
    if (hasCustomerProfile) {
      roles.add("customer");
    }
    if (memberships.length > 0) {
      roles.add("staff");
    }
    if (
      memberships.some(({ role }) => role === "manager" || role === "owner")
    ) {
      roles.add("manager");
    }
    if (memberships.some(({ role }) => role === "owner")) {
      roles.add("owner");
    }
    return [...roles];
  }
}
