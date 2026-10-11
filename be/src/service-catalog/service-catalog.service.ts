import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  dealershipServices,
  dealerships,
  serviceTypes,
} from "../database/schema";
import {
  requireAnyDealershipRole,
  requireDealershipRole,
} from "../domain/dealership-access";
import type {
  CreateDealershipServiceDto,
  CreateServiceTypeDto,
  UpdateDealershipServiceDto,
  UpdateServiceTypeDto,
} from "./dto/service-catalog.dto";

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
export class ServiceCatalogService {
  constructor(@InjectDb() private readonly db: Database) {}

  listServiceTypes() {
    return this.db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.isActive, true))
      .orderBy(asc(serviceTypes.name));
  }

  async createServiceType(auth: AuthContext, input: CreateServiceTypeDto) {
    requireAnyDealershipRole(auth, ["owner", "manager"]);
    try {
      const [created] = await this.db
        .insert(serviceTypes)
        .values({
          name: input.name.trim(),
          description: input.description?.trim() || null,
        })
        .returning();
      if (!created) {
        throw new Error("Service type insert returned no row");
      }
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException("Service type name is already in use");
      }
      throw error;
    }
  }

  async updateServiceType(
    auth: AuthContext,
    serviceTypeId: string,
    input: UpdateServiceTypeDto,
  ) {
    requireAnyDealershipRole(auth, ["owner", "manager"]);
    try {
      const [updated] = await this.db
        .update(serviceTypes)
        .set({
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description?.trim() || null }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          updatedAt: new Date(),
        })
        .where(eq(serviceTypes.id, serviceTypeId))
        .returning();
      if (!updated) {
        throw new NotFoundException("Service type not found");
      }
      return updated;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException("Service type name is already in use");
      }
      throw error;
    }
  }

  async listDealershipServices(dealershipId: string) {
    await this.requireActiveDealership(dealershipId);
    return this.db
      .select({
        id: dealershipServices.id,
        dealershipId: dealershipServices.dealershipId,
        serviceTypeId: dealershipServices.serviceTypeId,
        name: serviceTypes.name,
        description: serviceTypes.description,
        durationMinutes: dealershipServices.durationMinutes,
        isActive: dealershipServices.isActive,
      })
      .from(dealershipServices)
      .innerJoin(
        serviceTypes,
        eq(serviceTypes.id, dealershipServices.serviceTypeId),
      )
      .where(
        and(
          eq(dealershipServices.dealershipId, dealershipId),
          eq(dealershipServices.isActive, true),
          eq(serviceTypes.isActive, true),
        ),
      )
      .orderBy(asc(serviceTypes.name));
  }

  async createDealershipService(
    auth: AuthContext,
    dealershipId: string,
    input: CreateDealershipServiceDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager"]);
    await this.requireActiveDealership(dealershipId);
    const [serviceType] = await this.db
      .select({ id: serviceTypes.id })
      .from(serviceTypes)
      .where(
        and(
          eq(serviceTypes.id, input.serviceTypeId),
          eq(serviceTypes.isActive, true),
        ),
      )
      .limit(1);
    if (!serviceType) {
      throw new NotFoundException("Active service type not found");
    }

    try {
      const [offering] = await this.db
        .insert(dealershipServices)
        .values({
          dealershipId,
          serviceTypeId: input.serviceTypeId,
          durationMinutes: input.durationMinutes,
        })
        .returning();
      if (!offering) {
        throw new Error("Dealership service insert returned no row");
      }
      return offering;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Service is already configured for this dealership",
        );
      }
      throw error;
    }
  }

  async updateDealershipService(
    auth: AuthContext,
    dealershipId: string,
    dealershipServiceId: string,
    input: UpdateDealershipServiceDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager"]);
    const [updated] = await this.db
      .update(dealershipServices)
      .set({
        ...(input.durationMinutes === undefined
          ? {}
          : { durationMinutes: input.durationMinutes }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dealershipServices.id, dealershipServiceId),
          eq(dealershipServices.dealershipId, dealershipId),
        ),
      )
      .returning();
    if (!updated) {
      throw new NotFoundException("Dealership service not found");
    }
    return updated;
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
