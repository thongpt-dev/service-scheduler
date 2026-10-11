import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  bayServiceCapabilities,
  dealerships,
  serviceBays,
  serviceTypes,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import {
  CreateServiceBayCapabilityDto,
  CreateServiceBayDto,
  UpdateServiceBayDto,
} from "./dto/service-bay.dto";

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
export class ServiceBaysService {
  constructor(@InjectDb() private readonly db: Database) {}

  async listByDealership(auth: AuthContext, dealershipId: string) {
    await this.requireReadAccess(auth, dealershipId);
    return this.db
      .select()
      .from(serviceBays)
      .where(eq(serviceBays.dealershipId, dealershipId))
      .orderBy(asc(serviceBays.bayCode));
  }

  async create(
    auth: AuthContext,
    dealershipId: string,
    input: CreateServiceBayDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    try {
      const [created] = await this.db
        .insert(serviceBays)
        .values({ dealershipId, bayCode: input.bayCode.trim() })
        .returning();
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Bay code already exists in this dealership",
        );
      }
      throw error;
    }
  }

  async update(
    auth: AuthContext,
    dealershipId: string,
    serviceBayId: string,
    input: UpdateServiceBayDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireBay(dealershipId, serviceBayId);
    try {
      const [updated] = await this.db
        .update(serviceBays)
        .set({
          ...(input.bayCode === undefined
            ? {}
            : { bayCode: input.bayCode.trim() }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(serviceBays.id, serviceBayId),
            eq(serviceBays.dealershipId, dealershipId),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException("Service bay not found");
      }
      return updated;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Bay code already exists in this dealership",
        );
      }
      throw error;
    }
  }

  async listCapabilities(
    auth: AuthContext,
    dealershipId: string,
    serviceBayId: string,
  ) {
    await this.requireReadAccess(auth, dealershipId);
    await this.requireBay(dealershipId, serviceBayId);
    return this.db
      .select({
        serviceTypeId: bayServiceCapabilities.serviceTypeId,
        serviceName: serviceTypes.name,
        createdAt: bayServiceCapabilities.createdAt,
      })
      .from(bayServiceCapabilities)
      .innerJoin(
        serviceTypes,
        eq(serviceTypes.id, bayServiceCapabilities.serviceTypeId),
      )
      .where(eq(bayServiceCapabilities.bayId, serviceBayId))
      .orderBy(asc(serviceTypes.name));
  }

  async createCapability(
    auth: AuthContext,
    dealershipId: string,
    serviceBayId: string,
    input: CreateServiceBayCapabilityDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireBay(dealershipId, serviceBayId);
    await this.requireActiveServiceType(input.serviceTypeId);
    try {
      const [created] = await this.db
        .insert(bayServiceCapabilities)
        .values({ bayId: serviceBayId, serviceTypeId: input.serviceTypeId })
        .returning();
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException("Service capability already exists");
      }
      throw error;
    }
  }

  async deleteCapability(
    auth: AuthContext,
    dealershipId: string,
    serviceBayId: string,
    serviceTypeId: string,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireBay(dealershipId, serviceBayId);
    try {
      const [deleted] = await this.db
        .delete(bayServiceCapabilities)
        .where(
          and(
            eq(bayServiceCapabilities.bayId, serviceBayId),
            eq(bayServiceCapabilities.serviceTypeId, serviceTypeId),
          ),
        )
        .returning({ bayId: bayServiceCapabilities.bayId });
      if (!deleted) {
        throw new NotFoundException("Bay service capability not found");
      }
      return { deleted: true };
    } catch (error) {
      if (databaseErrorCode(error) === "23503") {
        throw new ConflictException(
          "Capability is referenced by appointment history and cannot be removed",
        );
      }
      throw error;
    }
  }

  private async requireReadAccess(
    auth: AuthContext,
    dealershipId: string,
  ): Promise<void> {
    await this.requireActiveDealership(dealershipId);
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
    await this.requireActiveDealership(dealershipId);
  }

  private async requireBay(
    dealershipId: string,
    serviceBayId: string,
  ): Promise<typeof serviceBays.$inferSelect> {
    const [bay] = await this.db
      .select()
      .from(serviceBays)
      .where(
        and(
          eq(serviceBays.id, serviceBayId),
          eq(serviceBays.dealershipId, dealershipId),
        ),
      )
      .limit(1);
    if (!bay) {
      throw new NotFoundException("Service bay not found");
    }
    return bay;
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

  private async requireActiveServiceType(serviceTypeId: string): Promise<void> {
    const [serviceType] = await this.db
      .select({ id: serviceTypes.id })
      .from(serviceTypes)
      .where(
        and(
          eq(serviceTypes.id, serviceTypeId),
          eq(serviceTypes.isActive, true),
        ),
      )
      .limit(1);
    if (!serviceType) {
      throw new NotFoundException("Active service type not found");
    }
  }
}
