import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  customers,
  dealershipClosures,
  dealershipCustomers,
  dealershipHours,
  dealershipMemberships,
  dealerships,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import type {
  CreateDealershipDto,
  UpdateDealershipDto,
} from "./dto/dealership.dto";
import {
  CreateDealershipClosureDto,
  CreateDealershipHoursDto,
  UpdateDealershipClosureDto,
  UpdateDealershipHoursDto,
} from "./dto/dealership-schedule.dto";

type CustomerDealershipSummary = Pick<
  typeof dealerships.$inferSelect,
  | "id"
  | "name"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "countryCode"
  | "timezone"
> & { associatedAt: Date };

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
export class DealershipsService {
  constructor(@InjectDb() private readonly db: Database) {}

  list() {
    return this.db
      .select()
      .from(dealerships)
      .where(eq(dealerships.isActive, true))
      .orderBy(dealerships.name);
  }

  async getById(dealershipId: string) {
    const [dealership] = await this.db
      .select()
      .from(dealerships)
      .where(
        and(eq(dealerships.id, dealershipId), eq(dealerships.isActive, true)),
      )
      .limit(1);
    if (!dealership) {
      throw new NotFoundException("Dealership not found");
    }
    return dealership;
  }

  async listHours(auth: AuthContext, dealershipId: string) {
    await this.requireReadAccess(auth, dealershipId);
    return this.db
      .select()
      .from(dealershipHours)
      .where(eq(dealershipHours.dealershipId, dealershipId))
      .orderBy(asc(dealershipHours.dayOfWeek));
  }

  async createHour(
    auth: AuthContext,
    dealershipId: string,
    input: CreateDealershipHoursDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    const values = this.normalizeHours(input);
    try {
      const [created] = await this.db
        .insert(dealershipHours)
        .values({ dealershipId, ...values })
        .returning();
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Operating hours already exist for this day",
        );
      }
      throw error;
    }
  }

  async updateHour(
    auth: AuthContext,
    dealershipId: string,
    hourId: string,
    input: UpdateDealershipHoursDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    const [existing] = await this.db
      .select()
      .from(dealershipHours)
      .where(
        and(
          eq(dealershipHours.id, hourId),
          eq(dealershipHours.dealershipId, dealershipId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Operating hours not found");
    }

    const merged = {
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      openTime:
        input.openTime === undefined ? existing.openTime : input.openTime,
      closeTime:
        input.closeTime === undefined ? existing.closeTime : input.closeTime,
      isClosed: input.isClosed ?? existing.isClosed,
    };
    const values = this.normalizeHours(merged);
    try {
      const [updated] = await this.db
        .update(dealershipHours)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(dealershipHours.id, hourId))
        .returning();
      if (!updated) {
        throw new NotFoundException("Operating hours not found");
      }
      return updated;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Operating hours already exist for this day",
        );
      }
      throw error;
    }
  }

  async listClosures(auth: AuthContext, dealershipId: string) {
    await this.requireReadAccess(auth, dealershipId);
    return this.db
      .select()
      .from(dealershipClosures)
      .where(eq(dealershipClosures.dealershipId, dealershipId))
      .orderBy(asc(dealershipClosures.startsAt));
  }

  async createClosure(
    auth: AuthContext,
    dealershipId: string,
    input: CreateDealershipClosureDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    this.assertPositiveWindow(startsAt, endsAt, "Closure");
    const [created] = await this.db
      .insert(dealershipClosures)
      .values({
        dealershipId,
        startsAt,
        endsAt,
        reason: input.reason?.trim() || null,
      })
      .returning();
    return created;
  }

  async updateClosure(
    auth: AuthContext,
    dealershipId: string,
    closureId: string,
    input: UpdateDealershipClosureDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    const [existing] = await this.db
      .select()
      .from(dealershipClosures)
      .where(
        and(
          eq(dealershipClosures.id, closureId),
          eq(dealershipClosures.dealershipId, dealershipId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Dealership closure not found");
    }
    const startsAt = input.startsAt
      ? new Date(input.startsAt)
      : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    this.assertPositiveWindow(startsAt, endsAt, "Closure");
    const [updated] = await this.db
      .update(dealershipClosures)
      .set({
        ...(input.startsAt === undefined ? {} : { startsAt }),
        ...(input.endsAt === undefined ? {} : { endsAt }),
        ...(input.reason === undefined
          ? {}
          : { reason: input.reason?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(dealershipClosures.id, closureId))
      .returning();
    if (!updated) {
      throw new NotFoundException("Dealership closure not found");
    }
    return updated;
  }

  async deleteClosure(
    auth: AuthContext,
    dealershipId: string,
    closureId: string,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    const [deleted] = await this.db
      .delete(dealershipClosures)
      .where(
        and(
          eq(dealershipClosures.id, closureId),
          eq(dealershipClosures.dealershipId, dealershipId),
        ),
      )
      .returning({ id: dealershipClosures.id });
    if (!deleted) {
      throw new NotFoundException("Dealership closure not found");
    }
    return { deleted: true };
  }

  async listForCustomer(
    auth: AuthContext,
  ): Promise<CustomerDealershipSummary[]> {
    const customerId = auth.customer?.id;
    if (!customerId) {
      throw new ForbiddenException("Customer profile is required");
    }
    await this.requireActiveCustomer(customerId);

    return this.db
      .select({
        id: dealerships.id,
        name: dealerships.name,
        addressLine1: dealerships.addressLine1,
        addressLine2: dealerships.addressLine2,
        city: dealerships.city,
        region: dealerships.region,
        postalCode: dealerships.postalCode,
        countryCode: dealerships.countryCode,
        timezone: dealerships.timezone,
        associatedAt: dealershipCustomers.createdAt,
      })
      .from(dealershipCustomers)
      .innerJoin(
        dealerships,
        eq(dealerships.id, dealershipCustomers.dealershipId),
      )
      .where(
        and(
          eq(dealershipCustomers.customerId, customerId),
          eq(dealerships.isActive, true),
        ),
      )
      .orderBy(asc(dealerships.name));
  }

  async associateCustomer(
    auth: AuthContext,
    dealershipId: string,
  ): Promise<typeof dealershipCustomers.$inferSelect> {
    const customerId = auth.customer?.id;
    if (!customerId) {
      throw new ForbiddenException("Customer profile is required");
    }
    await this.requireActiveCustomer(customerId);
    await this.getById(dealershipId);

    await this.db
      .insert(dealershipCustomers)
      .values({ dealershipId, customerId, createdByUserId: auth.userId })
      .onConflictDoNothing();

    const [association] = await this.db
      .select()
      .from(dealershipCustomers)
      .where(
        and(
          eq(dealershipCustomers.dealershipId, dealershipId),
          eq(dealershipCustomers.customerId, customerId),
        ),
      )
      .limit(1);
    if (!association) {
      throw new Error("Customer dealership association could not be created");
    }
    return association;
  }

  async create(auth: AuthContext, input: CreateDealershipDto) {
    if (
      !auth.principalRoles.includes("customer") &&
      !auth.principalRoles.includes("staff")
    ) {
      throw new ForbiddenException("An authenticated account is required");
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
    } catch {
      throw new BadRequestException("Invalid dealership timezone");
    }

    return this.db.transaction(async (tx) => {
      const [dealership] = await tx
        .insert(dealerships)
        .values({
          ...input,
          addressLine2: input.addressLine2?.trim() || null,
          name: input.name.trim(),
          addressLine1: input.addressLine1.trim(),
          city: input.city.trim(),
          region: input.region.trim(),
          postalCode: input.postalCode.trim(),
          timezone: input.timezone.trim(),
        })
        .returning();

      if (!dealership) {
        throw new Error("Dealership insert returned no row");
      }

      await tx.insert(dealershipMemberships).values({
        dealershipId: dealership.id,
        userId: auth.userId,
        role: "owner",
      });

      if (auth.customer) {
        await tx.insert(dealershipCustomers).values({
          dealershipId: dealership.id,
          customerId: auth.customer.id,
          createdByUserId: auth.userId,
        });
      }

      return dealership;
    });
  }

  async update(
    auth: AuthContext,
    dealershipId: string,
    input: UpdateDealershipDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner"]);
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      } catch {
        throw new BadRequestException("Invalid dealership timezone");
      }
    }

    const [updated] = await this.db
      .update(dealerships)
      .set({
        ...input,
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.addressLine1 === undefined
          ? {}
          : { addressLine1: input.addressLine1.trim() }),
        ...(input.addressLine2 === undefined
          ? {}
          : { addressLine2: input.addressLine2?.trim() || null }),
        ...(input.city === undefined ? {} : { city: input.city.trim() }),
        ...(input.region === undefined ? {} : { region: input.region.trim() }),
        ...(input.postalCode === undefined
          ? {}
          : { postalCode: input.postalCode.trim() }),
        ...(input.timezone === undefined
          ? {}
          : { timezone: input.timezone.trim() }),
        updatedAt: new Date(),
      })
      .where(eq(dealerships.id, dealershipId))
      .returning();

    if (!updated) {
      throw new NotFoundException("Dealership not found");
    }
    return updated;
  }

  async listMemberships(auth: AuthContext, dealershipId: string) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager"]);
    await this.getById(dealershipId);
    return this.db
      .select({
        userId: dealershipMemberships.userId,
        role: dealershipMemberships.role,
        isActive: dealershipMemberships.isActive,
      })
      .from(dealershipMemberships)
      .where(eq(dealershipMemberships.dealershipId, dealershipId))
      .orderBy(desc(dealershipMemberships.createdAt));
  }

  private async requireReadAccess(
    auth: AuthContext,
    dealershipId: string,
  ): Promise<void> {
    await this.getById(dealershipId);
    if (auth.principalRoles.includes("customer")) {
      return;
    }
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
  }

  private async requireWriteAccess(
    auth: AuthContext,
    dealershipId: string,
  ): Promise<void> {
    requireDealershipRole(auth, dealershipId, ["owner", "manager"]);
    await this.getById(dealershipId);
  }

  private normalizeHours(input: {
    dayOfWeek: number;
    openTime?: string | null;
    closeTime?: string | null;
    isClosed?: boolean;
  }) {
    if (input.isClosed ?? false) {
      return {
        dayOfWeek: input.dayOfWeek,
        openTime: null,
        closeTime: null,
        isClosed: true,
      };
    }
    if (
      !input.openTime ||
      !input.closeTime ||
      input.openTime >= input.closeTime
    ) {
      throw new BadRequestException(
        "Open hours require an open time earlier than close time",
      );
    }
    return {
      dayOfWeek: input.dayOfWeek,
      openTime: input.openTime,
      closeTime: input.closeTime,
      isClosed: false,
    };
  }

  private assertPositiveWindow(
    startsAt: Date,
    endsAt: Date,
    label: string,
  ): void {
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw new BadRequestException(`${label} end must be after start`);
    }
  }

  private async requireActiveCustomer(customerId: string): Promise<void> {
    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.isActive, true)))
      .limit(1);
    if (!customer) {
      throw new NotFoundException("Customer profile not found");
    }
  }
}
