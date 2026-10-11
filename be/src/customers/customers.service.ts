import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { normalizeEmail } from "../auth/security.util";
import { InjectDb, type Database } from "../database/database.types";
import {
  customers,
  dealershipCustomers,
  dealerships,
  users,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import type {
  CreateCustomerDto,
  UpdateCustomerProfileDto,
} from "./dto/customer.dto";

function databaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  if (error && typeof error === "object" && "cause" in error) {
    return databaseErrorCode(error.cause);
  }
  return undefined;
}

@Injectable()
export class CustomersService {
  constructor(@InjectDb() private readonly db: Database) {}

  async getMe(auth: AuthContext) {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, auth.customer.id), eq(customers.isActive, true)),
      )
      .limit(1);
    if (!customer) {
      throw new NotFoundException("Customer profile not found");
    }
    return customer;
  }

  async updateMe(auth: AuthContext, input: UpdateCustomerProfileDto) {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    const [updated] = await this.db
      .update(customers)
      .set({
        ...(input.firstName === undefined
          ? {}
          : { firstName: input.firstName.trim() }),
        ...(input.lastName === undefined
          ? {}
          : { lastName: input.lastName.trim() }),
        ...(input.phone === undefined
          ? {}
          : { phone: input.phone?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(customers.id, auth.customer.id), eq(customers.isActive, true)),
      )
      .returning();
    if (!updated) {
      throw new NotFoundException("Customer profile not found");
    }
    return updated;
  }

  async listByDealership(auth: AuthContext, dealershipId: string) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    return this.db
      .select({
        id: customers.id,
        userId: customers.userId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(dealershipCustomers)
      .innerJoin(customers, eq(customers.id, dealershipCustomers.customerId))
      .where(
        and(
          eq(dealershipCustomers.dealershipId, dealershipId),
          eq(customers.isActive, true),
        ),
      )
      .orderBy(asc(customers.lastName), asc(customers.firstName));
  }

  async getForDealership(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    const [customer] = await this.db
      .select({
        id: customers.id,
        userId: customers.userId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(dealershipCustomers)
      .innerJoin(customers, eq(customers.id, dealershipCustomers.customerId))
      .where(
        and(
          eq(dealershipCustomers.dealershipId, dealershipId),
          eq(dealershipCustomers.customerId, customerId),
          eq(customers.isActive, true),
        ),
      )
      .limit(1);
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  async createForDealership(
    auth: AuthContext,
    dealershipId: string,
    input: CreateCustomerDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    const email = normalizeEmail(input.email);

    try {
      return await this.db.transaction(async (tx) => {
        const [existingCustomer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.email, email))
          .limit(1);
        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingCustomer || existingUser) {
          throw new ConflictException(
            "Customer could not be created with those details",
          );
        }

        const [customer] = await tx
          .insert(customers)
          .values({
            email,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone?.trim() || null,
          })
          .returning();
        if (!customer) {
          throw new Error("Customer insert returned no row");
        }

        await tx.insert(dealershipCustomers).values({
          dealershipId,
          customerId: customer.id,
          createdByUserId: auth.userId,
        });
        return customer;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Customer could not be created with those details",
        );
      }
      throw error;
    }
  }

  async updateForDealership(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
    input: UpdateCustomerProfileDto,
  ) {
    await this.getForDealership(auth, dealershipId, customerId);
    const [updated] = await this.db
      .update(customers)
      .set({
        ...(input.firstName === undefined
          ? {}
          : { firstName: input.firstName.trim() }),
        ...(input.lastName === undefined
          ? {}
          : { lastName: input.lastName.trim() }),
        ...(input.phone === undefined
          ? {}
          : { phone: input.phone?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))
      .returning();
    if (!updated) {
      throw new NotFoundException("Customer not found");
    }
    return updated;
  }

  async isLinkedToDealership(dealershipId: string, customerId: string) {
    const [link] = await this.db
      .select({ customerId: dealershipCustomers.customerId })
      .from(dealershipCustomers)
      .innerJoin(customers, eq(customers.id, dealershipCustomers.customerId))
      .where(
        and(
          eq(dealershipCustomers.dealershipId, dealershipId),
          eq(dealershipCustomers.customerId, customerId),
          eq(customers.isActive, true),
        ),
      )
      .limit(1);
    return link !== undefined;
  }

  private async requireActiveDealership(dealershipId: string): Promise<void> {
    const [dealership] = await this.db
      .select({ id: dealerships.id })
      .from(dealerships)
      .where(
        and(eq(dealerships.id, dealershipId), eq(dealerships.isActive, true)),
      )
      .limit(1);
    if (!dealership) {
      throw new NotFoundException("Dealership not found");
    }
  }
}
