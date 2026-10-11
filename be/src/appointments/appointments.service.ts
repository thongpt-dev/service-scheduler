import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, lte, lt, or } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  appointments,
  appointmentAuditEvents,
  customerVehicleAccess,
  customers,
  dealershipCustomers,
  dealershipServices,
  dealershipVehicles,
  dealerships,
  idempotencyRecords,
  serviceTypes,
  vehicles,
} from "../database/schema";
import type {
  AppointmentAuditAction,
  AppointmentStatus,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import {
  CreateSelfServiceAppointmentDto,
  CreateStaffAssistedAppointmentDto,
} from "./dto/create-appointment.dto";
import {
  CustomerAppointmentListQueryDto,
  DealershipAppointmentListQueryDto,
  RescheduleAppointmentDto,
} from "./dto/appointment-lifecycle.dto";
import { allocateAppointmentResources } from "./appointment-scheduling.util";

const minimumNoticeMilliseconds = 2 * 60 * 60 * 1000;
const bookingHorizonMilliseconds = 60 * 24 * 60 * 60 * 1000;
const appointmentCreateOperation = "appointment:create";

interface BookingInput {
  dealershipId: string;
  vehicleId: string;
  serviceTypeId: string;
  startsAt: string;
  customerId: string;
}

interface BookingResult {
  appointment: typeof appointments.$inferSelect;
  replayed: boolean;
}

type BookingTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function databaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  if (error && typeof error === "object" && "cause" in error) {
    return databaseErrorCode(error.cause);
  }
  return undefined;
}

function slotUnavailable(
  reason = "The requested appointment interval is no longer available",
): ConflictException {
  return new ConflictException({
    code: "SLOT_UNAVAILABLE",
    message: reason,
  });
}

function requestHash(
  input: BookingInput,
  bookingChannel: "customer_self_service" | "staff_assisted",
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        dealershipId: input.dealershipId,
        vehicleId: input.vehicleId,
        serviceTypeId: input.serviceTypeId,
        startsAt: new Date(input.startsAt).toISOString(),
        customerId: input.customerId,
        bookingChannel,
      }),
    )
    .digest("hex");
}

@Injectable()
export class AppointmentsService {
  constructor(@InjectDb() private readonly db: Database) {}

  async createSelfService(
    auth: AuthContext,
    input: CreateSelfServiceAppointmentDto,
    idempotencyKey: string,
  ): Promise<BookingResult> {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    return this.createBooking(
      auth,
      { ...input, customerId: auth.customer.id },
      idempotencyKey,
      "customer_self_service",
    );
  }

  async createStaffAssisted(
    auth: AuthContext,
    input: CreateStaffAssistedAppointmentDto,
    idempotencyKey: string,
  ): Promise<BookingResult> {
    requireDealershipRole(auth, input.dealershipId, [
      "owner",
      "manager",
      "staff",
    ]);
    return this.createBooking(auth, input, idempotencyKey, "staff_assisted");
  }

  async listCustomerAppointments(
    auth: AuthContext,
    query: CustomerAppointmentListQueryDto,
  ) {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    const now = new Date();
    const conditions = [eq(appointments.customerId, auth.customer.id)];
    conditions.push(
      query.period === "past"
        ? lt(appointments.startsAt, now)
        : gte(appointments.startsAt, now),
    );
    if (query.status) {
      conditions.push(eq(appointments.status, query.status));
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(
        query.period === "past"
          ? desc(appointments.startsAt)
          : asc(appointments.startsAt),
      )
      .limit(query.limit + 1)
      .offset(query.offset);
    return this.page(rows, query.limit, query.offset);
  }

  async getCustomerAppointment(auth: AuthContext, appointmentId: string) {
    if (!auth.customer) {
      throw new ForbiddenException("Customer profile is required");
    }
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.customerId, auth.customer.id),
        ),
      )
      .limit(1);
    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }
    return appointment;
  }

  async listDealershipAppointments(
    auth: AuthContext,
    dealershipId: string,
    query: DealershipAppointmentListQueryDto,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException("from must be earlier than to");
    }
    const conditions = [
      eq(appointments.dealershipId, dealershipId),
      gte(appointments.startsAt, from),
      lt(appointments.startsAt, to),
    ];
    if (query.status) {
      conditions.push(eq(appointments.status, query.status));
    }
    if (query.customerId) {
      conditions.push(eq(appointments.customerId, query.customerId));
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(asc(appointments.startsAt), asc(appointments.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return this.page(rows, query.limit, query.offset);
  }

  async getDealershipAppointment(
    auth: AuthContext,
    dealershipId: string,
    appointmentId: string,
  ) {
    requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.dealershipId, dealershipId),
        ),
      )
      .limit(1);
    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }
    return appointment;
  }

  async cancelAppointment(auth: AuthContext, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appointment = await this.lockAppointment(tx, appointmentId);
      this.requireAppointmentAccess(auth, appointment);
      this.requireConfirmedFutureAppointment(appointment);
      const [cancelled] = await tx
        .update(appointments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(appointments.id, appointmentId))
        .returning();
      if (!cancelled) {
        throw new NotFoundException("Appointment not found");
      }
      await this.recordLifecycleEvent(tx, {
        appointment,
        actorUserId: auth.userId,
        action: "cancelled",
        newStatus: "cancelled",
      });
      return cancelled;
    });
  }

  async rescheduleAppointment(
    auth: AuthContext,
    appointmentId: string,
    input: RescheduleAppointmentDto,
  ) {
    const startsAt = new Date(input.startsAt);
    const now = new Date();
    if (
      Number.isNaN(startsAt.getTime()) ||
      startsAt.getTime() < now.getTime() + minimumNoticeMilliseconds ||
      startsAt.getTime() > now.getTime() + bookingHorizonMilliseconds
    ) {
      throw new BadRequestException(
        "startsAt must be at least 2 hours and no more than 60 days in the future",
      );
    }
    try {
      return await this.db.transaction(async (tx) => {
        const appointment = await this.lockAppointment(tx, appointmentId);
        this.requireAppointmentAccess(auth, appointment);
        this.requireConfirmedFutureAppointment(appointment);
        const dealership = await this.requireActiveDealership(
          tx,
          appointment.dealershipId,
        );
        await this.requireActiveCustomerAndOffering(tx, appointment);
        await this.requireCustomerVehicleAccess(
          tx,
          appointment.dealershipId,
          appointment.customerId,
          appointment.vehicleId,
        );
        const allocation = await allocateAppointmentResources(tx, {
          dealershipId: appointment.dealershipId,
          timezone: dealership.timezone,
          serviceTypeId: appointment.serviceTypeId,
          startsAt,
          durationMinutes: appointment.durationMinutesSnapshot,
          ignoredAppointmentId: appointment.id,
        });
        const [updated] = await tx
          .update(appointments)
          .set({
            startsAt: allocation.startsAt,
            endsAt: allocation.endsAt,
            assignedTechnicianId: allocation.technicianId,
            assignedBayId: allocation.bayId,
            updatedAt: now,
          })
          .where(eq(appointments.id, appointment.id))
          .returning();
        if (!updated) {
          throw new NotFoundException("Appointment not found");
        }
        await this.recordLifecycleEvent(tx, {
          appointment,
          actorUserId: auth.userId,
          action: "rescheduled",
          newStatus: appointment.status,
          newStartsAt: updated.startsAt,
          newEndsAt: updated.endsAt,
          newTechnicianId: updated.assignedTechnicianId,
          newBayId: updated.assignedBayId,
        });
        return updated;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23P01") {
        throw slotUnavailable(
          "Another booking has taken the requested resources",
        );
      }
      throw error;
    }
  }

  async updateAppointmentStatus(
    auth: AuthContext,
    appointmentId: string,
    status: "completed" | "no_show",
  ) {
    return this.db.transaction(async (tx) => {
      const appointment = await this.lockAppointment(tx, appointmentId);
      if (
        !auth.memberships.some(
          (membership) => membership.dealershipId === appointment.dealershipId,
        )
      ) {
        throw new NotFoundException("Appointment not found");
      }
      if (appointment.status !== "confirmed") {
        throw new ConflictException({
          code: "APPOINTMENT_NOT_MODIFIABLE",
          message: "Only confirmed appointments can change status",
        });
      }
      const now = new Date();
      if (
        (status === "no_show" && appointment.startsAt > now) ||
        (status === "completed" && appointment.endsAt > now)
      ) {
        throw new ConflictException({
          code: "APPOINTMENT_NOT_READY_FOR_STATUS",
          message:
            status === "no_show"
              ? "An appointment cannot be marked no-show before it starts"
              : "An appointment cannot be completed before its scheduled end",
        });
      }
      const [updated] = await tx
        .update(appointments)
        .set({ status, updatedAt: now })
        .where(eq(appointments.id, appointment.id))
        .returning();
      if (!updated) {
        throw new NotFoundException("Appointment not found");
      }
      await this.recordLifecycleEvent(tx, {
        appointment,
        actorUserId: auth.userId,
        action: status,
        newStatus: status,
      });
      return updated;
    });
  }

  private page<T>(items: T[], limit: number, offset: number) {
    return {
      items: items.slice(0, limit),
      limit,
      offset,
      hasMore: items.length > limit,
    };
  }

  private async lockAppointment(tx: BookingTransaction, appointmentId: string) {
    const [appointment] = await tx
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1)
      .for("update");
    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }
    return appointment;
  }

  private requireAppointmentAccess(
    auth: AuthContext,
    appointment: typeof appointments.$inferSelect,
  ): void {
    const ownsAppointment = auth.customer?.id === appointment.customerId;
    const belongsToDealership = auth.memberships.some(
      (membership) => membership.dealershipId === appointment.dealershipId,
    );
    if (!ownsAppointment && !belongsToDealership) {
      throw new NotFoundException("Appointment not found");
    }
  }

  private requireConfirmedFutureAppointment(
    appointment: typeof appointments.$inferSelect,
  ): void {
    if (
      appointment.status !== "confirmed" ||
      appointment.startsAt <= new Date()
    ) {
      throw new ConflictException({
        code: "APPOINTMENT_NOT_MODIFIABLE",
        message:
          "Only confirmed appointments that have not started can be changed",
      });
    }
  }

  private async requireActiveCustomerAndOffering(
    tx: BookingTransaction,
    appointment: typeof appointments.$inferSelect,
  ): Promise<void> {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(dealershipCustomers)
      .innerJoin(customers, eq(customers.id, dealershipCustomers.customerId))
      .where(
        and(
          eq(dealershipCustomers.dealershipId, appointment.dealershipId),
          eq(dealershipCustomers.customerId, appointment.customerId),
          eq(customers.isActive, true),
        ),
      )
      .limit(1);
    const [offering] = await tx
      .select({ serviceTypeId: dealershipServices.serviceTypeId })
      .from(dealershipServices)
      .innerJoin(
        serviceTypes,
        eq(serviceTypes.id, dealershipServices.serviceTypeId),
      )
      .where(
        and(
          eq(dealershipServices.dealershipId, appointment.dealershipId),
          eq(dealershipServices.serviceTypeId, appointment.serviceTypeId),
          eq(dealershipServices.isActive, true),
          eq(serviceTypes.isActive, true),
        ),
      )
      .limit(1);
    if (!customer || !offering) {
      throw new NotFoundException(
        "Appointment is no longer eligible to reschedule",
      );
    }
  }

  private async recordLifecycleEvent(
    tx: BookingTransaction,
    event: {
      appointment: typeof appointments.$inferSelect;
      actorUserId: string;
      action: AppointmentAuditAction;
      newStatus: AppointmentStatus;
      newStartsAt?: Date;
      newEndsAt?: Date;
      newTechnicianId?: string;
      newBayId?: string;
    },
  ): Promise<void> {
    await tx.insert(appointmentAuditEvents).values({
      appointmentId: event.appointment.id,
      actorUserId: event.actorUserId,
      action: event.action,
      previousStatus: event.appointment.status,
      newStatus: event.newStatus,
      previousStartsAt: event.newStartsAt ? event.appointment.startsAt : null,
      newStartsAt: event.newStartsAt ?? null,
      previousEndsAt: event.newEndsAt ? event.appointment.endsAt : null,
      newEndsAt: event.newEndsAt ?? null,
      previousTechnicianId: event.newTechnicianId
        ? event.appointment.assignedTechnicianId
        : null,
      newTechnicianId: event.newTechnicianId ?? null,
      previousBayId: event.newBayId ? event.appointment.assignedBayId : null,
      newBayId: event.newBayId ?? null,
    });
  }

  private async createBooking(
    auth: AuthContext,
    input: BookingInput,
    rawIdempotencyKey: string,
    bookingChannel: "customer_self_service" | "staff_assisted",
  ): Promise<BookingResult> {
    const idempotencyKey = rawIdempotencyKey.trim();
    if (idempotencyKey.length === 0 || idempotencyKey.length > 255) {
      throw new BadRequestException(
        "Idempotency-Key must contain 1 to 255 characters",
      );
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException("startsAt must be a valid zoned timestamp");
    }
    const now = new Date();
    if (
      startsAt.getTime() < now.getTime() + minimumNoticeMilliseconds ||
      startsAt.getTime() > now.getTime() + bookingHorizonMilliseconds
    ) {
      throw new BadRequestException(
        "startsAt must be at least 2 hours and no more than 60 days in the future",
      );
    }

    const hash = requestHash(input, bookingChannel);
    const operation = appointmentCreateOperation;
    try {
      return await this.db.transaction(async (tx) => {
        await tx
          .delete(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.actorUserId, auth.userId),
              eq(idempotencyRecords.operation, operation),
              eq(idempotencyRecords.idempotencyKey, idempotencyKey),
              lte(idempotencyRecords.expiresAt, now),
            ),
          );

        const [existingRecord] = await tx
          .select()
          .from(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.actorUserId, auth.userId),
              eq(idempotencyRecords.operation, operation),
              eq(idempotencyRecords.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existingRecord) {
          if (existingRecord.requestHash !== hash) {
            throw new ConflictException({
              code: "IDEMPOTENCY_KEY_REUSED",
              message:
                "Idempotency-Key was already used for a different request",
            });
          }
          const [existingAppointment] = await tx
            .select()
            .from(appointments)
            .where(eq(appointments.id, existingRecord.appointmentId))
            .limit(1);
          if (!existingAppointment) {
            throw new Error("Idempotent appointment result not found");
          }
          return { appointment: existingAppointment, replayed: true };
        }

        const [dealership] = await tx
          .select({ id: dealerships.id, timezone: dealerships.timezone })
          .from(dealerships)
          .where(
            and(
              eq(dealerships.id, input.dealershipId),
              eq(dealerships.isActive, true),
            ),
          )
          .limit(1);
        if (!dealership) {
          throw new NotFoundException("Dealership not found");
        }

        const [customerAssociation] = await tx
          .select({ customerId: customers.id })
          .from(dealershipCustomers)
          .innerJoin(
            customers,
            eq(customers.id, dealershipCustomers.customerId),
          )
          .where(
            and(
              eq(dealershipCustomers.dealershipId, input.dealershipId),
              eq(dealershipCustomers.customerId, input.customerId),
              eq(customers.isActive, true),
            ),
          )
          .limit(1);
        if (!customerAssociation) {
          throw new NotFoundException(
            "Customer not associated with dealership",
          );
        }

        const [vehicle] = await tx
          .select({ id: vehicles.id })
          .from(dealershipVehicles)
          .innerJoin(vehicles, eq(vehicles.id, dealershipVehicles.vehicleId))
          .leftJoin(
            customerVehicleAccess,
            and(
              eq(customerVehicleAccess.vehicleId, vehicles.id),
              eq(customerVehicleAccess.customerId, input.customerId),
            ),
          )
          .where(
            and(
              eq(dealershipVehicles.dealershipId, input.dealershipId),
              eq(dealershipVehicles.vehicleId, input.vehicleId),
              eq(vehicles.isActive, true),
              or(
                eq(vehicles.ownerCustomerId, input.customerId),
                eq(customerVehicleAccess.customerId, input.customerId),
              ),
            ),
          )
          .limit(1);
        if (!vehicle) {
          throw new NotFoundException(
            "Vehicle is unavailable to this customer at this dealership",
          );
        }

        const [offering] = await tx
          .select({
            durationMinutes: dealershipServices.durationMinutes,
            serviceName: serviceTypes.name,
          })
          .from(dealershipServices)
          .innerJoin(
            serviceTypes,
            eq(serviceTypes.id, dealershipServices.serviceTypeId),
          )
          .where(
            and(
              eq(dealershipServices.dealershipId, input.dealershipId),
              eq(dealershipServices.serviceTypeId, input.serviceTypeId),
              eq(dealershipServices.isActive, true),
              eq(serviceTypes.isActive, true),
            ),
          )
          .limit(1);
        if (!offering) {
          throw new NotFoundException("Active dealership service not found");
        }

        const allocation = await allocateAppointmentResources(tx, {
          dealershipId: input.dealershipId,
          timezone: dealership.timezone,
          serviceTypeId: input.serviceTypeId,
          startsAt,
          durationMinutes: offering.durationMinutes,
        });

        const [created] = await tx
          .insert(appointments)
          .values({
            appointmentRef: `APPT-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`,
            customerId: input.customerId,
            vehicleId: input.vehicleId,
            dealershipId: input.dealershipId,
            serviceTypeId: input.serviceTypeId,
            assignedTechnicianId: allocation.technicianId,
            assignedBayId: allocation.bayId,
            createdByUserId: auth.userId,
            bookingChannel,
            status: "confirmed",
            startsAt,
            endsAt: allocation.endsAt,
            serviceNameSnapshot: offering.serviceName,
            durationMinutesSnapshot: offering.durationMinutes,
          })
          .returning();
        if (!created) {
          throw new Error("Appointment insert returned no row");
        }
        await tx.insert(idempotencyRecords).values({
          actorUserId: auth.userId,
          operation,
          idempotencyKey,
          requestHash: hash,
          appointmentId: created.id,
        });
        return { appointment: created, replayed: false };
      });
    } catch (error) {
      const code = databaseErrorCode(error);
      if (code === "23505" || code === "23P01") {
        const replay = await this.findIdempotencyReplay(
          auth.userId,
          operation,
          idempotencyKey,
          hash,
        );
        if (replay) {
          return replay;
        }
      }
      if (code === "23P01") {
        throw slotUnavailable(
          "Another booking has taken the requested resources",
        );
      }
      throw error;
    }
  }

  private async findIdempotencyReplay(
    actorUserId: string,
    operation: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<BookingResult | undefined> {
    const [record] = await this.db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.actorUserId, actorUserId),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!record || record.expiresAt <= new Date()) {
      return undefined;
    }
    if (record.requestHash !== hash) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "Idempotency-Key was already used for a different request",
      });
    }
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, record.appointmentId))
      .limit(1);
    if (!appointment) {
      throw new Error("Idempotent appointment result not found");
    }
    return { appointment, replayed: true };
  }

  private async requireCustomerVehicleAccess(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    dealershipId: string,
    customerId: string,
    vehicleId: string,
  ): Promise<void> {
    const [vehicle] = await tx
      .select({ id: vehicles.id })
      .from(dealershipVehicles)
      .innerJoin(vehicles, eq(vehicles.id, dealershipVehicles.vehicleId))
      .leftJoin(
        customerVehicleAccess,
        and(
          eq(customerVehicleAccess.vehicleId, vehicles.id),
          eq(customerVehicleAccess.customerId, customerId),
        ),
      )
      .where(
        and(
          eq(dealershipVehicles.dealershipId, dealershipId),
          eq(dealershipVehicles.vehicleId, vehicleId),
          eq(vehicles.isActive, true),
          or(
            eq(vehicles.ownerCustomerId, customerId),
            eq(customerVehicleAccess.customerId, customerId),
          ),
        ),
      )
      .limit(1);
    if (!vehicle) {
      throw new NotFoundException(
        "Vehicle is unavailable to this customer at this dealership",
      );
    }
  }

  private async requireActiveDealership(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    dealershipId: string,
  ): Promise<{ id: string; timezone: string }> {
    const [dealership] = await tx
      .select({ id: dealerships.id, timezone: dealerships.timezone })
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
}
