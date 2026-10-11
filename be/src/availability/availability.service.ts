import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
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
  serviceBays,
  serviceTypes,
  technicianLeaves,
  technicianQualifications,
  technicianShifts,
  technicians,
  vehicles,
} from "../database/schema";
import { requireDealershipRole } from "../domain/dealership-access";
import type { AvailabilityQueryDto } from "./dto/availability-query.dto";
import {
  formatLocalDate,
  formatLocalTime,
  formatUtcOffset,
  getLocalDateTimeParts,
  parseLocalDate,
  resolveLocalDateTime,
} from "./timezone.util";

const minimumNoticeMilliseconds = 2 * 60 * 60 * 1000;
const bookingHorizonMilliseconds = 60 * 24 * 60 * 60 * 1000;
const minutesToMilliseconds = 60 * 1000;
const slotIncrementMinutes = 15;

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  localStartTime: string;
  utcOffset: string;
}

export interface AvailabilityResult {
  dealershipId: string;
  vehicleId: string;
  serviceTypeId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
}

@Injectable()
export class AvailabilityService {
  constructor(@InjectDb() private readonly db: Database) {}

  async getAvailability(
    auth: AuthContext,
    query: AvailabilityQueryDto,
  ): Promise<AvailabilityResult> {
    const [dealership] = await this.db
      .select({ id: dealerships.id, timezone: dealerships.timezone })
      .from(dealerships)
      .where(
        and(
          eq(dealerships.id, query.dealershipId),
          eq(dealerships.isActive, true),
        ),
      )
      .limit(1);
    if (!dealership) {
      throw new NotFoundException("Dealership not found");
    }

    const requestedDate = parseLocalDate(query.date);
    if (!requestedDate) {
      throw new BadRequestException("date must be a valid YYYY-MM-DD date");
    }

    const now = new Date();
    const earliestStart = new Date(now.getTime() + minimumNoticeMilliseconds);
    const latestStart = new Date(now.getTime() + bookingHorizonMilliseconds);
    const earliestDate = formatLocalDate(
      getLocalDateTimeParts(now, dealership.timezone),
    );
    const latestDate = formatLocalDate(
      getLocalDateTimeParts(latestStart, dealership.timezone),
    );
    if (query.date < earliestDate || query.date > latestDate) {
      throw new BadRequestException(
        "date must be within the next 60 days in the dealership timezone",
      );
    }

    const customerId = await this.resolveCustomerId(
      auth,
      query.customerId,
      query.dealershipId,
    );
    await this.requireCustomerVehicleAccess(
      query.dealershipId,
      customerId,
      query.vehicleId,
    );

    const [offering] = await this.db
      .select({ durationMinutes: dealershipServices.durationMinutes })
      .from(dealershipServices)
      .innerJoin(
        serviceTypes,
        eq(serviceTypes.id, dealershipServices.serviceTypeId),
      )
      .where(
        and(
          eq(dealershipServices.dealershipId, query.dealershipId),
          eq(dealershipServices.serviceTypeId, query.serviceTypeId),
          eq(dealershipServices.isActive, true),
          eq(serviceTypes.isActive, true),
        ),
      )
      .limit(1);
    if (!offering) {
      throw new NotFoundException("Active dealership service not found");
    }

    const weekday = new Date(
      Date.UTC(requestedDate.year, requestedDate.month - 1, requestedDate.day),
    ).getUTCDay();
    const [hours] = await this.db
      .select()
      .from(dealershipHours)
      .where(
        and(
          eq(dealershipHours.dealershipId, query.dealershipId),
          eq(dealershipHours.dayOfWeek, weekday),
        ),
      )
      .limit(1);

    const emptyResult = (): AvailabilityResult => ({
      dealershipId: query.dealershipId,
      vehicleId: query.vehicleId,
      serviceTypeId: query.serviceTypeId,
      date: query.date,
      timezone: dealership.timezone,
      durationMinutes: offering.durationMinutes,
      slots: [],
    });
    if (!hours || hours.isClosed || !hours.openTime || !hours.closeTime) {
      return emptyResult();
    }

    const openingInstants = resolveLocalDateTime(
      query.date,
      hours.openTime,
      dealership.timezone,
    );
    const closingInstants = resolveLocalDateTime(
      query.date,
      hours.closeTime,
      dealership.timezone,
    );
    if (openingInstants.length === 0 || closingInstants.length === 0) {
      return emptyResult();
    }
    const opensAt = openingInstants[0];
    const closesAt = closingInstants[closingInstants.length - 1];
    if (opensAt >= closesAt) {
      return emptyResult();
    }

    const techniciansForDealership = await this.db
      .select()
      .from(technicians)
      .where(
        and(
          eq(technicians.dealershipId, query.dealershipId),
          eq(technicians.isActive, true),
        ),
      );
    const baysForDealership = await this.db
      .select()
      .from(serviceBays)
      .where(
        and(
          eq(serviceBays.dealershipId, query.dealershipId),
          eq(serviceBays.isActive, true),
        ),
      );
    if (
      techniciansForDealership.length === 0 ||
      baysForDealership.length === 0
    ) {
      return emptyResult();
    }

    const technicianIds = techniciansForDealership.map(({ id }) => id);
    const bayIds = baysForDealership.map(({ id }) => id);
    const [
      qualifications,
      shifts,
      leaves,
      capabilities,
      closures,
      existingAppointments,
    ] = await Promise.all([
      this.db
        .select()
        .from(technicianQualifications)
        .where(
          and(
            inArray(technicianQualifications.technicianId, technicianIds),
            eq(technicianQualifications.serviceTypeId, query.serviceTypeId),
          ),
        ),
      this.db
        .select()
        .from(technicianShifts)
        .where(
          and(
            inArray(technicianShifts.technicianId, technicianIds),
            eq(technicianShifts.dayOfWeek, weekday),
            eq(technicianShifts.isActive, true),
          ),
        ),
      this.db
        .select()
        .from(technicianLeaves)
        .where(
          and(
            inArray(technicianLeaves.technicianId, technicianIds),
            lt(technicianLeaves.startsAt, closesAt),
            gt(technicianLeaves.endsAt, opensAt),
          ),
        ),
      this.db
        .select()
        .from(bayServiceCapabilities)
        .where(
          and(
            inArray(bayServiceCapabilities.bayId, bayIds),
            eq(bayServiceCapabilities.serviceTypeId, query.serviceTypeId),
          ),
        ),
      this.db
        .select()
        .from(dealershipClosures)
        .where(
          and(
            eq(dealershipClosures.dealershipId, query.dealershipId),
            lt(dealershipClosures.startsAt, closesAt),
            gt(dealershipClosures.endsAt, opensAt),
          ),
        ),
      this.db
        .select({
          assignedTechnicianId: appointments.assignedTechnicianId,
          assignedBayId: appointments.assignedBayId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.dealershipId, query.dealershipId),
            eq(appointments.status, "confirmed"),
            lt(appointments.startsAt, closesAt),
            gt(appointments.endsAt, opensAt),
          ),
        ),
    ]);

    const shiftWindows = shifts.flatMap((shift) => {
      const shiftStarts = resolveLocalDateTime(
        query.date,
        shift.startLocalTime,
        dealership.timezone,
      );
      const shiftEnds = resolveLocalDateTime(
        query.date,
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

    const slots: AvailabilitySlot[] = [];
    const firstMinute =
      Math.ceil(opensAt.getTime() / minutesToMilliseconds) *
      minutesToMilliseconds;
    const intervalLength = offering.durationMinutes * minutesToMilliseconds;

    for (
      let startMilliseconds = firstMinute;
      startMilliseconds < closesAt.getTime();
      startMilliseconds += minutesToMilliseconds
    ) {
      const startsAt = new Date(startMilliseconds);
      const localParts = getLocalDateTimeParts(startsAt, dealership.timezone);
      if (
        formatLocalDate(localParts) !== query.date ||
        localParts.minute % slotIncrementMinutes !== 0 ||
        localParts.second !== 0 ||
        startsAt < earliestStart ||
        startsAt > latestStart
      ) {
        continue;
      }

      const endsAt = new Date(startMilliseconds + intervalLength);
      if (
        endsAt > closesAt ||
        closures.some(
          (closure) => closure.startsAt < endsAt && closure.endsAt > startsAt,
        )
      ) {
        continue;
      }

      const hasAvailableTechnician = techniciansForDealership.some(
        (technician) => {
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
          if (!fitsShift) {
            return false;
          }

          const onLeave = leaves.some(
            (leave) =>
              leave.technicianId === technician.id &&
              leave.startsAt < endsAt &&
              leave.endsAt > startsAt,
          );
          const hasAppointment = existingAppointments.some(
            (appointment) =>
              appointment.assignedTechnicianId === technician.id &&
              appointment.startsAt < endsAt &&
              appointment.endsAt > startsAt,
          );
          return !onLeave && !hasAppointment;
        },
      );
      if (!hasAvailableTechnician) {
        continue;
      }

      const hasAvailableBay = baysForDealership.some((bay) => {
        const compatible = capabilities.some(
          (capability) => capability.bayId === bay.id,
        );
        const hasAppointment = existingAppointments.some(
          (appointment) =>
            appointment.assignedBayId === bay.id &&
            appointment.startsAt < endsAt &&
            appointment.endsAt > startsAt,
        );
        return compatible && !hasAppointment;
      });
      if (!hasAvailableBay) {
        continue;
      }

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        localStartTime: formatLocalTime(localParts),
        utcOffset: formatUtcOffset(startsAt, dealership.timezone),
      });
    }

    return {
      dealershipId: query.dealershipId,
      vehicleId: query.vehicleId,
      serviceTypeId: query.serviceTypeId,
      date: query.date,
      timezone: dealership.timezone,
      durationMinutes: offering.durationMinutes,
      slots,
    };
  }

  private async resolveCustomerId(
    auth: AuthContext,
    requestedCustomerId: string | undefined,
    dealershipId: string,
  ): Promise<string> {
    const customerId = requestedCustomerId ?? auth.customer?.id;
    if (!customerId) {
      throw new BadRequestException(
        "customerId is required for staff-assisted availability",
      );
    }
    if (auth.customer?.id !== customerId) {
      requireDealershipRole(auth, dealershipId, ["owner", "manager", "staff"]);
    }

    const [association] = await this.db
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
    if (!association) {
      throw new NotFoundException("Customer not associated with dealership");
    }
    return customerId;
  }

  private async requireCustomerVehicleAccess(
    dealershipId: string,
    customerId: string,
    vehicleId: string,
  ): Promise<void> {
    const [vehicle] = await this.db
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
}
