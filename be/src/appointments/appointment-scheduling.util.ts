import { BadRequestException, ConflictException } from "@nestjs/common";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import type { Database } from "../database/database.types";
import {
  appointments,
  bayServiceCapabilities,
  dealershipClosures,
  dealershipHours,
  serviceBays,
  technicianLeaves,
  technicianQualifications,
  technicianShifts,
  technicians,
} from "../database/schema";
import {
  formatLocalDate,
  getLocalDateTimeParts,
  parseLocalDate,
  resolveLocalDateTime,
} from "../availability/timezone.util";

type BookingTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface AppointmentResourceRequest {
  dealershipId: string;
  timezone: string;
  serviceTypeId: string;
  startsAt: Date;
  durationMinutes: number;
  ignoredAppointmentId?: string;
}

export interface AppointmentResourceAllocation {
  startsAt: Date;
  endsAt: Date;
  technicianId: string;
  bayId: string;
}

function slotUnavailable(message: string): ConflictException {
  return new ConflictException({ code: "SLOT_UNAVAILABLE", message });
}

export async function allocateAppointmentResources(
  tx: BookingTransaction,
  request: AppointmentResourceRequest,
): Promise<AppointmentResourceAllocation> {
  const { dealershipId, timezone, serviceTypeId, startsAt } = request;
  const localStart = getLocalDateTimeParts(startsAt, timezone);
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
  const dateParts = parseLocalDate(localDate);
  if (!dateParts) {
    throw new BadRequestException("startsAt has an invalid local date");
  }
  const dayOfWeek = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day),
  ).getUTCDay();
  const endsAt = new Date(
    startsAt.getTime() + request.durationMinutes * 60_000,
  );

  const [hours] = await tx
    .select()
    .from(dealershipHours)
    .where(
      and(
        eq(dealershipHours.dealershipId, dealershipId),
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
    timezone,
  );
  const closingInstants = resolveLocalDateTime(
    localDate,
    hours.closeTime,
    timezone,
  );
  if (
    openingInstants.length === 0 ||
    closingInstants.length === 0 ||
    startsAt < openingInstants[0] ||
    endsAt > closingInstants[closingInstants.length - 1]
  ) {
    throw slotUnavailable("Requested interval is outside dealership hours");
  }
  const closures = await tx
    .select({ id: dealershipClosures.id })
    .from(dealershipClosures)
    .where(
      and(
        eq(dealershipClosures.dealershipId, dealershipId),
        lt(dealershipClosures.startsAt, endsAt),
        gt(dealershipClosures.endsAt, startsAt),
      ),
    );
  if (closures.length > 0) {
    throw slotUnavailable("A dealership closure overlaps this interval");
  }

  const activeTechnicians = await tx
    .select()
    .from(technicians)
    .where(
      and(
        eq(technicians.dealershipId, dealershipId),
        eq(technicians.isActive, true),
      ),
    );
  const activeBays = await tx
    .select()
    .from(serviceBays)
    .where(
      and(
        eq(serviceBays.dealershipId, dealershipId),
        eq(serviceBays.isActive, true),
      ),
    );
  const overlapFilters = [
    eq(appointments.dealershipId, dealershipId),
    eq(appointments.status, "confirmed"),
    lt(appointments.startsAt, endsAt),
    gt(appointments.endsAt, startsAt),
  ];
  const overlappingAppointments = await tx
    .select({
      id: appointments.id,
      assignedTechnicianId: appointments.assignedTechnicianId,
      assignedBayId: appointments.assignedBayId,
    })
    .from(appointments)
    .where(
      and(
        ...overlapFilters,
        ...(request.ignoredAppointmentId
          ? [ne(appointments.id, request.ignoredAppointmentId)]
          : []),
      ),
    );

  const technicianIds = activeTechnicians.map(({ id }) => id);
  const bayIds = activeBays.map(({ id }) => id);
  const qualifications = technicianIds.length
    ? await tx
        .select()
        .from(technicianQualifications)
        .where(
          and(
            inArray(technicianQualifications.technicianId, technicianIds),
            eq(technicianQualifications.serviceTypeId, serviceTypeId),
          ),
        )
    : [];
  const shifts = technicianIds.length
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
  const leaves = technicianIds.length
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
  const capabilities = bayIds.length
    ? await tx
        .select()
        .from(bayServiceCapabilities)
        .where(
          and(
            inArray(bayServiceCapabilities.bayId, bayIds),
            eq(bayServiceCapabilities.serviceTypeId, serviceTypeId),
          ),
        )
    : [];

  const shiftWindows = shifts.flatMap((shift) => {
    const shiftStarts = resolveLocalDateTime(
      localDate,
      shift.startLocalTime,
      timezone,
    );
    const shiftEnds = resolveLocalDateTime(
      localDate,
      shift.endLocalTime,
      timezone,
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

  const technician = activeTechnicians
    .filter((candidate) => {
      const qualification = qualifications.find(
        (item) => item.technicianId === candidate.id,
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
          shift.technicianId === candidate.id &&
          startsAt >= shift.startsAt &&
          endsAt <= shift.endsAt,
      );
      const onLeave = leaves.some(
        (leave) =>
          leave.technicianId === candidate.id &&
          leave.startsAt < endsAt &&
          leave.endsAt > startsAt,
      );
      const alreadyBooked = overlappingAppointments.some(
        (item) => item.assignedTechnicianId === candidate.id,
      );
      return fitsShift && !onLeave && !alreadyBooked;
    })
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  const bay = activeBays
    .filter((candidate) => {
      const compatible = capabilities.some(
        (capability) => capability.bayId === candidate.id,
      );
      const alreadyBooked = overlappingAppointments.some(
        (item) => item.assignedBayId === candidate.id,
      );
      return compatible && !alreadyBooked;
    })
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!technician) {
    throw slotUnavailable(
      "No qualified technician is available for this interval",
    );
  }
  if (!bay) {
    throw slotUnavailable(
      "No compatible service bay is available for this interval",
    );
  }
  return {
    startsAt,
    endsAt,
    technicianId: technician.id,
    bayId: bay.id,
  };
}
