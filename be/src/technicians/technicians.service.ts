import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  dealerships,
  serviceTypes,
  technicianLeaves,
  technicianQualifications,
  technicianShifts,
  technicians,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import {
  CreateTechnicianDto,
  CreateTechnicianLeaveDto,
  CreateTechnicianQualificationDto,
  CreateTechnicianShiftDto,
  UpdateTechnicianDto,
  UpdateTechnicianLeaveDto,
  UpdateTechnicianQualificationDto,
  UpdateTechnicianShiftDto,
} from "./dto/technician.dto";

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
export class TechniciansService {
  constructor(@InjectDb() private readonly db: Database) {}

  async listByDealership(auth: AuthContext, dealershipId: string) {
    await this.requireReadAccess(auth, dealershipId);
    return this.db
      .select()
      .from(technicians)
      .where(eq(technicians.dealershipId, dealershipId))
      .orderBy(asc(technicians.displayName));
  }

  async create(
    auth: AuthContext,
    dealershipId: string,
    input: CreateTechnicianDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    try {
      const [created] = await this.db
        .insert(technicians)
        .values({
          dealershipId,
          displayName: input.displayName.trim(),
          employeeCode: input.employeeCode?.trim() || null,
        })
        .returning();
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Technician employee code is already in use for this dealership",
        );
      }
      throw error;
    }
  }

  async update(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    input: UpdateTechnicianDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    try {
      const [updated] = await this.db
        .update(technicians)
        .set({
          ...(input.displayName === undefined
            ? {}
            : { displayName: input.displayName.trim() }),
          ...(input.employeeCode === undefined
            ? {}
            : { employeeCode: input.employeeCode?.trim() || null }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(technicians.id, technicianId),
            eq(technicians.dealershipId, dealershipId),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException("Technician not found");
      }
      return updated;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Technician employee code is already in use for this dealership",
        );
      }
      throw error;
    }
  }

  async listQualifications(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
  ) {
    await this.requireReadAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    return this.db
      .select()
      .from(technicianQualifications)
      .where(eq(technicianQualifications.technicianId, technicianId))
      .orderBy(asc(technicianQualifications.serviceTypeId));
  }

  async createQualification(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    input: CreateTechnicianQualificationDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    await this.requireActiveServiceType(input.serviceTypeId);
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    this.assertPositiveWindow(validFrom, validTo, "Qualification");
    try {
      const [created] = await this.db
        .insert(technicianQualifications)
        .values({
          technicianId,
          serviceTypeId: input.serviceTypeId,
          validFrom,
          validTo,
        })
        .returning();
      return created;
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException(
          "Technician already has this service qualification",
        );
      }
      throw error;
    }
  }

  async updateQualification(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    serviceTypeId: string,
    input: UpdateTechnicianQualificationDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    const [existing] = await this.db
      .select()
      .from(technicianQualifications)
      .where(
        and(
          eq(technicianQualifications.technicianId, technicianId),
          eq(technicianQualifications.serviceTypeId, serviceTypeId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Technician qualification not found");
    }
    const validFrom =
      input.validFrom === undefined
        ? existing.validFrom
        : input.validFrom
          ? new Date(input.validFrom)
          : null;
    const validTo =
      input.validTo === undefined
        ? existing.validTo
        : input.validTo
          ? new Date(input.validTo)
          : null;
    this.assertPositiveWindow(validFrom, validTo, "Qualification");
    const [updated] = await this.db
      .update(technicianQualifications)
      .set({
        ...(input.validFrom === undefined ? {} : { validFrom }),
        ...(input.validTo === undefined ? {} : { validTo }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(technicianQualifications.technicianId, technicianId),
          eq(technicianQualifications.serviceTypeId, serviceTypeId),
        ),
      )
      .returning();
    if (!updated) {
      throw new NotFoundException("Technician qualification not found");
    }
    return updated;
  }

  async deleteQualification(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    serviceTypeId: string,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    try {
      const [deleted] = await this.db
        .delete(technicianQualifications)
        .where(
          and(
            eq(technicianQualifications.technicianId, technicianId),
            eq(technicianQualifications.serviceTypeId, serviceTypeId),
          ),
        )
        .returning({ technicianId: technicianQualifications.technicianId });
      if (!deleted) {
        throw new NotFoundException("Technician qualification not found");
      }
      return { deleted: true };
    } catch (error) {
      if (databaseErrorCode(error) === "23503") {
        throw new ConflictException(
          "Qualification is referenced by appointment history; set its validTo instead",
        );
      }
      throw error;
    }
  }

  async listShifts(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
  ) {
    await this.requireReadAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    return this.db
      .select()
      .from(technicianShifts)
      .where(eq(technicianShifts.technicianId, technicianId))
      .orderBy(
        asc(technicianShifts.dayOfWeek),
        asc(technicianShifts.startLocalTime),
      );
  }

  async createShift(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    input: CreateTechnicianShiftDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    this.assertShiftWindow(input.startLocalTime, input.endLocalTime);
    const [created] = await this.db
      .insert(technicianShifts)
      .values({
        technicianId,
        dayOfWeek: input.dayOfWeek,
        startLocalTime: input.startLocalTime,
        endLocalTime: input.endLocalTime,
        isActive: input.isActive ?? true,
      })
      .returning();
    return created;
  }

  async updateShift(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    shiftId: string,
    input: UpdateTechnicianShiftDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    const [existing] = await this.db
      .select()
      .from(technicianShifts)
      .where(
        and(
          eq(technicianShifts.id, shiftId),
          eq(technicianShifts.technicianId, technicianId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Technician shift not found");
    }
    const startLocalTime = input.startLocalTime ?? existing.startLocalTime;
    const endLocalTime = input.endLocalTime ?? existing.endLocalTime;
    this.assertShiftWindow(startLocalTime, endLocalTime);
    const [updated] = await this.db
      .update(technicianShifts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(technicianShifts.id, shiftId))
      .returning();
    if (!updated) {
      throw new NotFoundException("Technician shift not found");
    }
    return updated;
  }

  async listLeaves(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
  ) {
    await this.requireReadAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    return this.db
      .select()
      .from(technicianLeaves)
      .where(eq(technicianLeaves.technicianId, technicianId))
      .orderBy(asc(technicianLeaves.startsAt));
  }

  async createLeave(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    input: CreateTechnicianLeaveDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    this.assertPositiveWindow(startsAt, endsAt, "Leave");
    const [created] = await this.db
      .insert(technicianLeaves)
      .values({
        technicianId,
        startsAt,
        endsAt,
        reason: input.reason?.trim() || null,
      })
      .returning();
    return created;
  }

  async updateLeave(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    leaveId: string,
    input: UpdateTechnicianLeaveDto,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    const [existing] = await this.db
      .select()
      .from(technicianLeaves)
      .where(
        and(
          eq(technicianLeaves.id, leaveId),
          eq(technicianLeaves.technicianId, technicianId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Technician leave not found");
    }
    const startsAt = input.startsAt
      ? new Date(input.startsAt)
      : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    this.assertPositiveWindow(startsAt, endsAt, "Leave");
    const [updated] = await this.db
      .update(technicianLeaves)
      .set({
        ...(input.startsAt === undefined ? {} : { startsAt }),
        ...(input.endsAt === undefined ? {} : { endsAt }),
        ...(input.reason === undefined
          ? {}
          : { reason: input.reason?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(technicianLeaves.id, leaveId))
      .returning();
    if (!updated) {
      throw new NotFoundException("Technician leave not found");
    }
    return updated;
  }

  async deleteLeave(
    auth: AuthContext,
    dealershipId: string,
    technicianId: string,
    leaveId: string,
  ) {
    await this.requireWriteAccess(auth, dealershipId);
    await this.requireTechnician(dealershipId, technicianId);
    const [deleted] = await this.db
      .delete(technicianLeaves)
      .where(
        and(
          eq(technicianLeaves.id, leaveId),
          eq(technicianLeaves.technicianId, technicianId),
        ),
      )
      .returning({ id: technicianLeaves.id });
    if (!deleted) {
      throw new NotFoundException("Technician leave not found");
    }
    return { deleted: true };
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

  private async requireTechnician(
    dealershipId: string,
    technicianId: string,
  ): Promise<typeof technicians.$inferSelect> {
    const [technician] = await this.db
      .select()
      .from(technicians)
      .where(
        and(
          eq(technicians.id, technicianId),
          eq(technicians.dealershipId, dealershipId),
        ),
      )
      .limit(1);
    if (!technician) {
      throw new NotFoundException("Technician not found");
    }
    return technician;
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

  private assertShiftWindow(start: string, end: string): void {
    if (start >= end) {
      throw new BadRequestException("Shift end must be after shift start");
    }
  }

  private assertPositiveWindow(
    startsAt: Date | null,
    endsAt: Date | null,
    label: string,
  ): void {
    if (
      (startsAt && Number.isNaN(startsAt.getTime())) ||
      (endsAt && Number.isNaN(endsAt.getTime())) ||
      (startsAt && endsAt && startsAt >= endsAt)
    ) {
      throw new BadRequestException(`${label} end must be after start`);
    }
  }
}
