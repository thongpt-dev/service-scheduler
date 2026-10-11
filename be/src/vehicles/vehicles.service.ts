import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, or } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  customerVehicleAccess,
  dealershipCustomers,
  dealershipVehicles,
  dealerships,
  vehicles,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import { CustomersService } from "../customers/customers.service";
import { CreateVehicleDto, UpdateVehicleDto } from "./dto/vehicle.dto";

function databaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly customersService: CustomersService,
  ) {}

  async listMyVehicles(auth: AuthContext) {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    return this.db
      .selectDistinct({
        id: vehicles.id,
        ownerCustomerId: vehicles.ownerCustomerId,
        vin: vehicles.vin,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        isActive: vehicles.isActive,
      })
      .from(vehicles)
      .leftJoin(
        customerVehicleAccess,
        eq(customerVehicleAccess.vehicleId, vehicles.id),
      )
      .where(
        and(
          eq(vehicles.isActive, true),
          or(
            eq(vehicles.ownerCustomerId, auth.customer.id),
            eq(customerVehicleAccess.customerId, auth.customer.id),
          ),
        ),
      );
  }

  async assignOwnedVehicleToDealership(
    auth: AuthContext,
    vehicleId: string,
    dealershipId: string,
  ) {
    const customerId = auth.customer?.id;
    if (!customerId) {
      throw new ForbiddenException("Customer profile is required");
    }
    await this.requireActiveDealership(dealershipId);

    const [vehicle] = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.ownerCustomerId, customerId),
          eq(vehicles.isActive, true),
        ),
      )
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }

    return this.db.transaction(async (tx) => {
      await tx
        .insert(dealershipCustomers)
        .values({ dealershipId, customerId, createdByUserId: auth.userId })
        .onConflictDoNothing();
      await tx
        .insert(dealershipVehicles)
        .values({ dealershipId, vehicleId, assignedByUserId: auth.userId })
        .onConflictDoNothing();

      const [assignment] = await tx
        .select()
        .from(dealershipVehicles)
        .where(
          and(
            eq(dealershipVehicles.dealershipId, dealershipId),
            eq(dealershipVehicles.vehicleId, vehicleId),
          ),
        )
        .limit(1);
      if (!assignment) {
        throw new Error("Dealership vehicle assignment could not be created");
      }
      return assignment;
    });
  }

  async listForDealershipCustomer(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    await this.requireDealershipCustomer(dealershipId, customerId);

    return this.db
      .selectDistinct({
        id: vehicles.id,
        ownerCustomerId: vehicles.ownerCustomerId,
        vin: vehicles.vin,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        isActive: vehicles.isActive,
      })
      .from(dealershipVehicles)
      .innerJoin(vehicles, eq(vehicles.id, dealershipVehicles.vehicleId))
      .leftJoin(
        customerVehicleAccess,
        eq(customerVehicleAccess.vehicleId, vehicles.id),
      )
      .where(
        and(
          eq(vehicles.isActive, true),
          eq(dealershipVehicles.dealershipId, dealershipId),
          or(
            eq(vehicles.ownerCustomerId, customerId),
            eq(customerVehicleAccess.customerId, customerId),
          ),
        ),
      );
  }

  async createForCustomer(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
    input: CreateVehicleDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    await this.requireDealershipCustomer(dealershipId, customerId);
    try {
      return await this.db.transaction(async (tx) => {
        const [vehicle] = await tx
          .insert(vehicles)
          .values({
            ownerCustomerId: customerId,
            vin: input.vin.toUpperCase(),
            make: input.make.trim(),
            model: input.model.trim(),
            year: input.year,
          })
          .returning();
        if (!vehicle) {
          throw new Error("Vehicle insert returned no row");
        }
        await tx.insert(dealershipVehicles).values({
          dealershipId,
          vehicleId: vehicle.id,
          assignedByUserId: auth.userId,
        });
        return vehicle;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Vehicle could not be created with those details",
        );
      }
      throw error;
    }
  }

  async updateForDealership(
    auth: AuthContext,
    dealershipId: string,
    vehicleId: string,
    input: UpdateVehicleDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    const [existing] = await this.db
      .select({ vehicleId: dealershipVehicles.vehicleId })
      .from(dealershipVehicles)
      .innerJoin(vehicles, eq(vehicles.id, dealershipVehicles.vehicleId))
      .where(
        and(
          eq(dealershipVehicles.dealershipId, dealershipId),
          eq(dealershipVehicles.vehicleId, vehicleId),
          eq(vehicles.isActive, true),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Vehicle not found");
    }

    const [updated] = await this.db
      .update(vehicles)
      .set({
        ...(input.make === undefined ? {} : { make: input.make.trim() }),
        ...(input.model === undefined ? {} : { model: input.model.trim() }),
        ...(input.year === undefined ? {} : { year: input.year }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();
    if (!updated) {
      throw new NotFoundException("Vehicle not found");
    }
    return updated;
  }

  async grantAccess(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
    vehicleId: string,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    await this.requireDealershipCustomer(dealershipId, customerId);
    const [vehicle] = await this.db
      .select({ ownerCustomerId: vehicles.ownerCustomerId })
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.isActive, true)))
      .limit(1);
    if (
      !vehicle ||
      !(await this.isAssignedToDealership(dealershipId, vehicleId))
    ) {
      throw new NotFoundException("Vehicle not found");
    }
    if (vehicle.ownerCustomerId === customerId) {
      throw new BadRequestException("The vehicle owner already has access");
    }
    await this.db
      .insert(customerVehicleAccess)
      .values({ customerId, vehicleId })
      .onConflictDoNothing();
    return { granted: true };
  }

  async revokeAccess(
    auth: AuthContext,
    dealershipId: string,
    customerId: string,
    vehicleId: string,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    await this.requireActiveDealership(dealershipId);
    await this.requireDealershipCustomer(dealershipId, customerId);
    const [vehicle] = await this.db
      .select({ ownerCustomerId: vehicles.ownerCustomerId })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    if (
      !vehicle ||
      !(await this.isAssignedToDealership(dealershipId, vehicleId))
    ) {
      throw new NotFoundException("Vehicle not found");
    }
    if (vehicle.ownerCustomerId === customerId) {
      throw new BadRequestException("Vehicle ownership cannot be revoked here");
    }
    const deleted = await this.db
      .delete(customerVehicleAccess)
      .where(
        and(
          eq(customerVehicleAccess.customerId, customerId),
          eq(customerVehicleAccess.vehicleId, vehicleId),
        ),
      )
      .returning({ customerId: customerVehicleAccess.customerId });
    if (deleted.length === 0) {
      throw new NotFoundException("Vehicle access not found");
    }
    return { revoked: true };
  }

  private async requireDealershipCustomer(
    dealershipId: string,
    customerId: string,
  ): Promise<void> {
    if (
      !(await this.customersService.isLinkedToDealership(
        dealershipId,
        customerId,
      ))
    ) {
      throw new NotFoundException("Customer not found");
    }
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

  private async isAssignedToDealership(
    dealershipId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const [assignment] = await this.db
      .select({ vehicleId: dealershipVehicles.vehicleId })
      .from(dealershipVehicles)
      .where(
        and(
          eq(dealershipVehicles.dealershipId, dealershipId),
          eq(dealershipVehicles.vehicleId, vehicleId),
        ),
      )
      .limit(1);
    return assignment !== undefined;
  }
}
