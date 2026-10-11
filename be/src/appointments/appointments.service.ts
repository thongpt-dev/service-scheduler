import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt, inArray, lte, lt, or } from "drizzle-orm";
import type { AuthContext } from "../auth/auth.types";
import { InjectDb, type Database } from "../database/database.types";
import {
  appointments,
  bayServiceCapabilities,
  customerVehicleAccess,
  customers,
  dealershipClosures,
  dealershipCustomers,
  dealershipHours,
  dealershipServices,
  dealershipVehicles,
  dealerships,
  idempotencyRecords,
  serviceBays,
  serviceTypes,
  technicianLeaves,
  technicianQualifications,
  technicianShifts,
  technicians,
  vehicles,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import {
  CreateSelfServiceAppointmentDto,
  CreateStaffAssistedAppointmentDto,
} from "./dto/create-appointment.dto";
import {
  formatLocalDate,
  getLocalDateTimeParts,
  parseLocalDate,
  resolveLocalDateTime,
} from "../availability/timezone.util";

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

        const localStart = getLocalDateTimeParts(startsAt, dealership.timezone);
        const localDate = formatLocalDate(localStart);
        if (
          localStart.minute % 15 !== 0 ||
          localStart.second !== 0 ||
          startsAt.getUTCMilliseconds() !== 0
        ) {
          throw new BadRequestException(
            "startsAt must align to a 15-minute increment in dealership local time",
          );
        }
        const localDateParts = parseLocalDate(localDate);
        if (!localDateParts) {
          throw new BadRequestException("startsAt has an invalid local date");
        }
        const dayOfWeek = new Date(
          Date.UTC(
            localDateParts.year,
            localDateParts.month - 1,
            localDateParts.day,
          ),
        ).getUTCDay();
        const endsAt = new Date(
          startsAt.getTime() + offering.durationMinutes * 60_000,
        );
        const [hours] = await tx
          .select()
          .from(dealershipHours)
          .where(
            and(
              eq(dealershipHours.dealershipId, input.dealershipId),
              eq(dealershipHours.dayOfWeek, dayOfWeek),
            ),
          )
          .limit(1);
        if (!hours || hours.isClosed || !hours.openTime || !hours.closeTime) {
          throw slotUnavailable("Dealership is closed on the requested date");
        }
        const openingInstants = resolveLocalDateTime(
          localDate,
          hours.openTime,
          dealership.timezone,
        );
        const closingInstants = resolveLocalDateTime(
          localDate,
          hours.closeTime,
          dealership.timezone,
        );
        if (
          openingInstants.length === 0 ||
          closingInstants.length === 0 ||
          startsAt < openingInstants[0] ||
          endsAt > closingInstants[closingInstants.length - 1]
        ) {
          throw slotUnavailable(
            "Requested interval is outside dealership hours",
          );
        }

        const overlappingClosures = await tx
          .select({ id: dealershipClosures.id })
          .from(dealershipClosures)
          .where(
            and(
              eq(dealershipClosures.dealershipId, input.dealershipId),
              lt(dealershipClosures.startsAt, endsAt),
              gt(dealershipClosures.endsAt, startsAt),
            ),
          );
        const activeTechnicians = await tx
          .select()
          .from(technicians)
          .where(
            and(
              eq(technicians.dealershipId, input.dealershipId),
              eq(technicians.isActive, true),
            ),
          );
        const activeBays = await tx
          .select()
          .from(serviceBays)
          .where(
            and(
              eq(serviceBays.dealershipId, input.dealershipId),
              eq(serviceBays.isActive, true),
            ),
          );
        const existingAppointments = await tx
          .select({
            assignedTechnicianId: appointments.assignedTechnicianId,
            assignedBayId: appointments.assignedBayId,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.dealershipId, input.dealershipId),
              eq(appointments.status, "confirmed"),
              lt(appointments.startsAt, endsAt),
              gt(appointments.endsAt, startsAt),
            ),
          );
        if (overlappingClosures.length > 0) {
          throw slotUnavailable("A dealership closure overlaps this interval");
        }

        const technicianIds = activeTechnicians.map(({ id }) => id);
        const bayIds = activeBays.map(({ id }) => id);
        const qualifications =
          technicianIds.length > 0
            ? await tx
                .select()
                .from(technicianQualifications)
                .where(
                  and(
                    inArray(
                      technicianQualifications.technicianId,
                      technicianIds,
                    ),
                    eq(
                      technicianQualifications.serviceTypeId,
                      input.serviceTypeId,
                    ),
                  ),
                )
            : [];
        const shifts =
          technicianIds.length > 0
            ? await tx
                .select()
                .from(technicianShifts)
                .where(
                  and(
                    inArray(technicianShifts.technicianId, technicianIds),
                    eq(technicianShifts.dayOfWeek, dayOfWeek),
                    eq(technicianShifts.isActive, true),
                  ),
                )
            : [];
        const leaves =
          technicianIds.length > 0
            ? await tx
                .select()
                .from(technicianLeaves)
                .where(
                  and(
                    inArray(technicianLeaves.technicianId, technicianIds),
                    lt(technicianLeaves.startsAt, endsAt),
                    gt(technicianLeaves.endsAt, startsAt),
                  ),
                )
            : [];
        const capabilities =
          bayIds.length > 0
            ? await tx
                .select()
                .from(bayServiceCapabilities)
                .where(
                  and(
                    inArray(bayServiceCapabilities.bayId, bayIds),
                    eq(
                      bayServiceCapabilities.serviceTypeId,
                      input.serviceTypeId,
                    ),
                  ),
                )
            : [];

        const shiftWindows = shifts.flatMap((shift) => {
          const shiftStarts = resolveLocalDateTime(
            localDate,
            shift.startLocalTime,
            dealership.timezone,
          );
          const shiftEnds = resolveLocalDateTime(
            localDate,
            shift.endLocalTime,
            dealership.timezone,
          );
          if (shiftStarts.length === 0 || shiftEnds.length === 0) {
            return [];
          }
          return [
            {
              technicianId: shift.technicianId,
              startsAt: shiftStarts[0],
              endsAt: shiftEnds[shiftEnds.length - 1],
            },
          ];
        });

        const assignedTechnician = activeTechnicians
          .filter((technician) => {
            const qualification = qualifications.find(
              (item) => item.technicianId === technician.id,
            );
            if (
              !qualification ||
              (qualification.validFrom && qualification.validFrom > startsAt) ||
              (qualification.validTo && qualification.validTo < endsAt)
            ) {
              return false;
            }
            const fitsShift = shiftWindows.some(
              (shift) =>
                shift.technicianId === technician.id &&
                startsAt >= shift.startsAt &&
                endsAt <= shift.endsAt,
            );
            const onLeave = leaves.some(
              (leave) =>
                leave.technicianId === technician.id &&
                leave.startsAt < endsAt &&
                leave.endsAt > startsAt,
            );
            const hasAppointment = existingAppointments.some(
              (appointment) =>
                appointment.assignedTechnicianId === technician.id,
            );
            return fitsShift && !onLeave && !hasAppointment;
          })
          .sort((left, right) => left.id.localeCompare(right.id))[0];
        const assignedBay = activeBays
          .filter((bay) => {
            const compatible = capabilities.some(
              (capability) => capability.bayId === bay.id,
            );
            const hasAppointment = existingAppointments.some(
              (appointment) => appointment.assignedBayId === bay.id,
            );
            return compatible && !hasAppointment;
          })
          .sort((left, right) => left.id.localeCompare(right.id))[0];
        if (!assignedTechnician) {
          throw slotUnavailable(
            `No qualified technician is available for this interval (active=${activeTechnicians.length}, qualifications=${qualifications.length}, shifts=${shiftWindows.length}, leave=${leaves.length}, overlapping appointments=${existingAppointments.length})`,
          );
        }
        if (!assignedBay) {
          throw slotUnavailable(
            "No compatible service bay is available for this interval",
          );
        }

        const [created] = await tx
          .insert(appointments)
          .values({
            appointmentRef: `APPT-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`,
            customerId: input.customerId,
            vehicleId: input.vehicleId,
            dealershipId: input.dealershipId,
            serviceTypeId: input.serviceTypeId,
            assignedTechnicianId: assignedTechnician.id,
            assignedBayId: assignedBay.id,
            createdByUserId: auth.userId,
            bookingChannel,
            status: "confirmed",
            startsAt,
            endsAt,
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
