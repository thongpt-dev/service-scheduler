import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AvailabilityService } from "../../src/availability/availability.service";
import { AppointmentsService } from "../../src/appointments/appointments.service";
import {
  addCalendarDays,
  formatLocalDate,
  getLocalDateTimeParts,
  parseLocalDate,
} from "../../src/availability/timezone.util";
import { AuthService } from "../../src/auth/auth.service";
import * as schema from "../../src/database/schema";
import { CustomersService } from "../../src/customers/customers.service";
import { DealershipsService } from "../../src/dealerships/dealerships.service";
import { ServiceCatalogService } from "../../src/service-catalog/service-catalog.service";
import { ServiceBaysService } from "../../src/service-bays/service-bays.service";
import { TechniciansService } from "../../src/technicians/technicians.service";
import { VehiclesService } from "../../src/vehicles/vehicles.service";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function nextWeekdayDate(timeZone: string, weekday?: number): string {
  const today = formatLocalDate(getLocalDateTimeParts(new Date(), timeZone));
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addCalendarDays(today, offset);
    const parts = parseLocalDate(date);
    if (!parts) {
      continue;
    }
    const dayOfWeek = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay();
    if (
      weekday === undefined
        ? dayOfWeek >= 1 && dayOfWeek <= 5
        : dayOfWeek === weekday
    ) {
      return date;
    }
  }
  throw new Error("Could not find a weekday in the next two weeks");
}

async function expectError(
  operation: () => Promise<unknown>,
  expectedError: new (...args: never[]) => Error,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof expectedError, message);
    return;
  }
  throw new Error(message);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    new URL(databaseUrl).pathname.slice(1) !== "service_scheduler_test"
  ) {
    throw new Error(
      "Set TEST_DATABASE_URL to service_scheduler_test; refusing other databases",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const authService = new AuthService(
    db,
    new ConfigService({
      JWT_SECRET: "domain-integration-secret-at-least-32-bytes",
      JWT_ISSUER: "service-scheduler-domain-integration",
      JWT_AUDIENCE: "service-scheduler-test-clients",
      JWT_ACCESS_TOKEN_TTL_SECONDS: "1800",
    }),
  );
  const availabilityService = new AvailabilityService(db);
  const appointmentsService = new AppointmentsService(db);
  const customersService = new CustomersService(db);
  const dealershipsService = new DealershipsService(db);
  const vehiclesService = new VehiclesService(db, customersService);
  const serviceCatalogService = new ServiceCatalogService(db);
  const serviceBaysService = new ServiceBaysService(db);
  const techniciansService = new TechniciansService(db);

  try {
    execFileSync("npm", ["run", "db:seed"], {
      cwd: resolve(__dirname, "../.."),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
      },
      stdio: "inherit",
    });

    const ownerToken = await authService.staffLogin({
      email: "sample.owner@example.test",
      password: "LocalOwnerPass123!",
    });
    const ownerAuth = await authService.authenticateBearerToken(
      ownerToken.accessToken,
    );
    const staffToken = await authService.staffLogin({
      email: "sample.staff@example.test",
      password: "LocalStaffPass123!",
    });
    const staffAuth = await authService.authenticateBearerToken(
      staffToken.accessToken,
    );
    const managerToken = await authService.staffLogin({
      email: "sample.manager@example.test",
      password: "LocalManagerPass123!",
    });
    const managerAuth = await authService.authenticateBearerToken(
      managerToken.accessToken,
    );
    const customerToken = await authService.customerLogin({
      email: "sample.customer@example.test",
      password: "LocalCustomerPass123!",
    });
    const customerAuth = await authService.authenticateBearerToken(
      customerToken.accessToken,
    );
    const sampleCustomer = customerAuth.customer;
    assert(sampleCustomer !== null, "Seeded customer must have a profile");
    const customerVehicles = await vehiclesService.listMyVehicles(customerAuth);
    const ownedVehicle = customerVehicles.find(
      (vehicle) => vehicle.id === "66666666-6666-4666-8666-666666666666",
    );
    const unassignedVehicle = customerVehicles.find(
      (vehicle) => vehicle.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    assert(
      ownedVehicle?.dealershipAssignments.some(
        ({ dealershipId }) =>
          dealershipId === "11111111-1111-4111-8111-111111111111",
      ) === true,
      "Customer vehicle endpoint service must include the seeded owned vehicle",
    );
    assert(
      unassignedVehicle?.dealershipAssignments.length === 0,
      "Customer vehicle endpoint identifies vehicles that are not assigned to a dealership",
    );
    const relationTestVehicleId = randomUUID();
    await db.insert(schema.vehicles).values({
      id: relationTestVehicleId,
      ownerCustomerId: sampleCustomer.id,
      vin: `TEST${randomUUID().replaceAll("-", "").slice(0, 13)}`,
      make: "Integration",
      model: "Many-to-many fixture",
      year: 2025,
    });
    await db.insert(schema.dealershipVehicles).values([
      {
        vehicleId: relationTestVehicleId,
        dealershipId: "11111111-1111-4111-8111-111111111111",
        assignedByUserId: customerAuth.userId,
      },
      {
        vehicleId: relationTestVehicleId,
        dealershipId: "11111111-1111-4111-8111-111111111112",
        assignedByUserId: customerAuth.userId,
      },
    ]);
    const multiplyAssignedVehicle = (
      await vehiclesService.listMyVehicles(customerAuth)
    ).find((vehicle) => vehicle.id === relationTestVehicleId);
    assert(
      multiplyAssignedVehicle?.dealershipAssignments.length === 2,
      "Customer vehicle endpoint returns all dealership assignments for a vehicle",
    );
    await db
      .delete(schema.dealershipVehicles)
      .where(eq(schema.dealershipVehicles.vehicleId, relationTestVehicleId));
    await db
      .delete(schema.vehicles)
      .where(eq(schema.vehicles.id, relationTestVehicleId));
    const sampleDealershipId = "11111111-1111-4111-8111-111111111111";
    const sampleVehicleId = "66666666-6666-4666-8666-666666666666";
    const sampleServiceTypeId = "22222222-2222-4222-8222-222222222222";
    const availabilityDate = nextWeekdayDate("America/Los_Angeles");
    const customerAvailability = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    assert(
      customerAvailability.slots.length > 0 &&
        customerAvailability.timezone === "America/Los_Angeles" &&
        customerAvailability.durationMinutes === 60 &&
        customerAvailability.slots.every(
          (slot) =>
            new Date(slot.endsAt).getTime() -
              new Date(slot.startsAt).getTime() ===
            60 * 60 * 1000,
        ),
      "Customer availability uses assigned vehicle, dealership timezone, and active offering duration",
    );
    const staffAvailability = await availabilityService.getAvailability(
      ownerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        customerId: sampleCustomer.id,
        date: availabilityDate,
      },
    );
    assert(
      staffAvailability.slots.length === customerAvailability.slots.length,
      "Dealership staff can search availability for an associated customer",
    );
    const closedSaturday = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: nextWeekdayDate("America/Los_Angeles", 6),
      },
    );
    assert(
      closedSaturday.slots.length === 0,
      "Closed dealership weekdays must not produce availability slots",
    );
    const firstSlot = customerAvailability.slots[0];
    assert(firstSlot !== undefined, "Expected at least one candidate slot");
    await db.insert(schema.appointments).values({
      appointmentRef: `AVAIL-${randomUUID().slice(0, 8)}`,
      customerId: sampleCustomer.id,
      vehicleId: sampleVehicleId,
      dealershipId: sampleDealershipId,
      serviceTypeId: sampleServiceTypeId,
      assignedTechnicianId: "33333333-3333-4333-8333-333333333333",
      assignedBayId: "44444444-4444-4444-8444-444444444444",
      createdByUserId: ownerAuth.userId,
      bookingChannel: "customer_self_service",
      status: "confirmed",
      startsAt: new Date(firstSlot.startsAt),
      endsAt: new Date(firstSlot.endsAt),
      serviceNameSnapshot: "Standard Maintenance",
      durationMinutesSnapshot: 60,
    });
    const availabilityAfterConfirmation =
      await availabilityService.getAvailability(customerAuth, {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      });
    assert(
      !availabilityAfterConfirmation.slots.some(
        (slot) => slot.startsAt === firstSlot.startsAt,
      ),
      "Confirmed appointments must remove resource-conflicting availability slots",
    );
    const unblockedSlot = availabilityAfterConfirmation.slots[0];
    assert(
      unblockedSlot !== undefined,
      "Expected another unblocked candidate slot",
    );

    const availabilityClosure = await dealershipsService.createClosure(
      ownerAuth,
      sampleDealershipId,
      {
        startsAt: unblockedSlot.startsAt,
        endsAt: unblockedSlot.endsAt,
        reason: "Availability integration closure",
      },
    );
    const availabilityDuringClosure = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    assert(
      !availabilityDuringClosure.slots.some(
        (slot) => slot.startsAt === unblockedSlot.startsAt,
      ),
      "Dated dealership closures must block overlapping candidate slots",
    );
    await dealershipsService.deleteClosure(
      ownerAuth,
      sampleDealershipId,
      availabilityClosure.id,
    );

    const availabilityLeave = await techniciansService.createLeave(
      ownerAuth,
      sampleDealershipId,
      "33333333-3333-4333-8333-333333333333",
      {
        startsAt: unblockedSlot.startsAt,
        endsAt: unblockedSlot.endsAt,
        reason: "Availability integration leave",
      },
    );
    const availabilityDuringLeave = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    assert(
      !availabilityDuringLeave.slots.some(
        (slot) => slot.startsAt === unblockedSlot.startsAt,
      ),
      "Technician leave must block overlapping candidate slots",
    );
    await techniciansService.deleteLeave(
      ownerAuth,
      sampleDealershipId,
      "33333333-3333-4333-8333-333333333333",
      availabilityLeave.id,
    );

    await techniciansService.updateQualification(
      ownerAuth,
      sampleDealershipId,
      "33333333-3333-4333-8333-333333333333",
      sampleServiceTypeId,
      { validTo: unblockedSlot.startsAt },
    );
    const availabilityOutsideQualification =
      await availabilityService.getAvailability(customerAuth, {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      });
    assert(
      availabilityOutsideQualification.slots.length === 0,
      "Expired technician qualification must remove availability",
    );
    await techniciansService.updateQualification(
      ownerAuth,
      sampleDealershipId,
      "33333333-3333-4333-8333-333333333333",
      sampleServiceTypeId,
      { validTo: null },
    );

    const seededShifts = await techniciansService.listShifts(
      ownerAuth,
      sampleDealershipId,
      "33333333-3333-4333-8333-333333333333",
    );
    for (const shift of seededShifts) {
      await techniciansService.updateShift(
        ownerAuth,
        sampleDealershipId,
        "33333333-3333-4333-8333-333333333333",
        shift.id,
        { isActive: false },
      );
    }
    const availabilityWithoutShift = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    assert(
      availabilityWithoutShift.slots.length === 0,
      "A technician without an active shift must not provide availability",
    );
    for (const shift of seededShifts) {
      await techniciansService.updateShift(
        ownerAuth,
        sampleDealershipId,
        "33333333-3333-4333-8333-333333333333",
        shift.id,
        { isActive: true },
      );
    }

    const brakeServiceTypeId = "22222222-2222-4222-8222-222222222223";
    const existingBrakeOffering = (
      await serviceCatalogService.listDealershipServices(sampleDealershipId)
    ).find((offering) => offering.serviceTypeId === brakeServiceTypeId);
    if (existingBrakeOffering) {
      await serviceCatalogService.updateDealershipService(
        ownerAuth,
        sampleDealershipId,
        existingBrakeOffering.id,
        { durationMinutes: 60, isActive: true },
      );
    } else {
      await serviceCatalogService.createDealershipService(
        ownerAuth,
        sampleDealershipId,
        { serviceTypeId: brakeServiceTypeId, durationMinutes: 60 },
      );
    }
    const seededBrakeQualifications =
      await techniciansService.listQualifications(
        ownerAuth,
        sampleDealershipId,
        "33333333-3333-4333-8333-333333333333",
      );
    const existingBrakeQualification = seededBrakeQualifications.find(
      (qualification) => qualification.serviceTypeId === brakeServiceTypeId,
    );
    if (existingBrakeQualification) {
      await techniciansService.updateQualification(
        ownerAuth,
        sampleDealershipId,
        "33333333-3333-4333-8333-333333333333",
        brakeServiceTypeId,
        { validFrom: null, validTo: null },
      );
    } else {
      await techniciansService.createQualification(
        ownerAuth,
        sampleDealershipId,
        "33333333-3333-4333-8333-333333333333",
        { serviceTypeId: brakeServiceTypeId },
      );
    }
    const seededCapabilities = await serviceBaysService.listCapabilities(
      ownerAuth,
      sampleDealershipId,
      "44444444-4444-4444-8444-444444444444",
    );
    if (
      seededCapabilities.some(
        (capability) => capability.serviceTypeId === brakeServiceTypeId,
      )
    ) {
      await serviceBaysService.deleteCapability(
        ownerAuth,
        sampleDealershipId,
        "44444444-4444-4444-8444-444444444444",
        brakeServiceTypeId,
      );
    }
    const availabilityWithoutCompatibleBay =
      await availabilityService.getAvailability(customerAuth, {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: brakeServiceTypeId,
        date: availabilityDate,
      });
    assert(
      availabilityWithoutCompatibleBay.slots.length === 0,
      "A service without an active compatible bay must not provide availability",
    );
    await serviceBaysService.createCapability(
      ownerAuth,
      sampleDealershipId,
      "44444444-4444-4444-8444-444444444444",
      { serviceTypeId: brakeServiceTypeId },
    );
    const availabilityWithCompatibleBay =
      await availabilityService.getAvailability(customerAuth, {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: brakeServiceTypeId,
        date: availabilityDate,
      });
    assert(
      availabilityWithCompatibleBay.slots.length > 0,
      "An active compatible bay allows otherwise eligible slots",
    );

    const selfBookingAvailability = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    const selfBookingSlot = selfBookingAvailability.slots[0];
    const alternateSelfBookingSlot = selfBookingAvailability.slots[1];
    assert(
      selfBookingSlot !== undefined &&
        alternateSelfBookingSlot !== undefined &&
        selfBookingSlot.startsAt.length > 0,
      "Expected multiple candidate slots for booking and concurrency tests",
    );
    const selfBookingRequest = {
      dealershipId: sampleDealershipId,
      vehicleId: sampleVehicleId,
      serviceTypeId: sampleServiceTypeId,
      startsAt: selfBookingSlot.startsAt,
    };
    const selfBookingKey = `self-${randomUUID()}`;
    const selfBooking = await appointmentsService.createSelfService(
      customerAuth,
      selfBookingRequest,
      selfBookingKey,
    );
    assert(
      selfBooking.appointment.customerId === sampleCustomer.id &&
        selfBooking.appointment.bookingChannel === "customer_self_service" &&
        selfBooking.appointment.durationMinutesSnapshot === 60 &&
        selfBooking.appointment.assignedTechnicianId.length > 0 &&
        selfBooking.appointment.assignedBayId.length > 0 &&
        selfBooking.replayed === false,
      "Self-service booking derives customer and duration and confirms once",
    );
    const selfBookingReplay = await appointmentsService.createSelfService(
      customerAuth,
      selfBookingRequest,
      selfBookingKey,
    );
    assert(
      selfBookingReplay.replayed &&
        selfBookingReplay.appointment.id === selfBooking.appointment.id,
      "Matching idempotency retries return the original appointment",
    );
    await expectError(
      () =>
        appointmentsService.createSelfService(
          customerAuth,
          {
            ...selfBookingRequest,
            startsAt: alternateSelfBookingSlot.startsAt,
          },
          selfBookingKey,
        ),
      ConflictException,
      "Reusing an idempotency key with a different request must conflict",
    );

    const concurrencyAvailability = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    const competingSlot = concurrencyAvailability.slots[0];
    assert(
      competingSlot !== undefined,
      "Expected a fresh candidate slot after the initial booking",
    );
    assert(
      new Date(competingSlot.startsAt) >= selfBooking.appointment.endsAt,
      `Concurrency candidate overlaps the initial booking: candidate=${competingSlot.startsAt}, initialEnd=${selfBooking.appointment.endsAt.toISOString()}`,
    );
    const competingRequest = {
      ...selfBookingRequest,
      startsAt: competingSlot.startsAt,
    };
    const competingBookings = await Promise.allSettled([
      appointmentsService.createSelfService(
        customerAuth,
        competingRequest,
        `compete-${randomUUID()}`,
      ),
      appointmentsService.createSelfService(
        customerAuth,
        competingRequest,
        `compete-${randomUUID()}`,
      ),
    ]);
    const successfulCompetitors = competingBookings.filter(
      (result) => result.status === "fulfilled",
    );
    const rejectedCompetitors = competingBookings.filter(
      (result) => result.status === "rejected",
    );
    const competingFailureMessages = rejectedCompetitors.map((result) =>
      result.status === "rejected" && result.reason instanceof Error
        ? result.reason.message
        : "unknown error",
    );
    assert(
      successfulCompetitors.length === 1 &&
        rejectedCompetitors.length === 1 &&
        rejectedCompetitors[0].reason instanceof ConflictException,
      `Only one competing request can confirm the same technician/bay interval; succeeded=${successfulCompetitors.length}, failures=${competingFailureMessages.join(" | ")}`,
    );

    const customerAppointments =
      await appointmentsService.listCustomerAppointments(customerAuth, {
        period: "upcoming",
        limit: 50,
        offset: 0,
      });
    assert(
      customerAppointments.items.some(
        ({ id }) => id === selfBooking.appointment.id,
      ),
      "Customers can list their own upcoming appointments",
    );
    const staffAppointments =
      await appointmentsService.listDealershipAppointments(
        staffAuth,
        sampleDealershipId,
        {
          from: new Date(
            selfBooking.appointment.startsAt.getTime() - 60_000,
          ).toISOString(),
          to: new Date(
            selfBooking.appointment.endsAt.getTime() + 60_000,
          ).toISOString(),
          limit: 50,
          offset: 0,
        },
      );
    assert(
      staffAppointments.items.some(
        ({ id }) => id === selfBooking.appointment.id,
      ),
      "Dealership staff can search their schedule in a bounded interval",
    );
    await expectError(
      () =>
        appointmentsService.getDealershipAppointment(
          managerAuth,
          sampleDealershipId,
          selfBooking.appointment.id,
        ),
      ForbiddenException,
      "A manager from another dealership cannot read this appointment",
    );
    await expectError(
      () =>
        appointmentsService.updateAppointmentStatus(
          staffAuth,
          selfBooking.appointment.id,
          "completed",
        ),
      ConflictException,
      "A future appointment cannot be marked completed",
    );

    const freshAvailability = await availabilityService.getAvailability(
      customerAuth,
      {
        dealershipId: sampleDealershipId,
        vehicleId: sampleVehicleId,
        serviceTypeId: sampleServiceTypeId,
        date: availabilityDate,
      },
    );
    const rescheduleSlot = freshAvailability.slots.at(-1);
    assert(rescheduleSlot !== undefined, "Expected a free reschedule slot");
    const rescheduled = await appointmentsService.rescheduleAppointment(
      customerAuth,
      selfBooking.appointment.id,
      { startsAt: rescheduleSlot.startsAt },
    );
    assert(
      rescheduled.startsAt.toISOString() === rescheduleSlot.startsAt &&
        rescheduled.durationMinutesSnapshot ===
          selfBooking.appointment.durationMinutesSnapshot,
      "Rescheduling retains the booked duration and updates the slot",
    );
    await expectError(
      () =>
        appointmentsService.rescheduleAppointment(
          customerAuth,
          selfBooking.appointment.id,
          { startsAt: competingSlot.startsAt },
        ),
      ConflictException,
      "A failed reschedule into an occupied slot must conflict",
    );
    const unchangedAppointment =
      await appointmentsService.getCustomerAppointment(
        customerAuth,
        selfBooking.appointment.id,
      );
    assert(
      unchangedAppointment.startsAt.toISOString() ===
        rescheduled.startsAt.toISOString(),
      "A failed reschedule preserves the original schedule",
    );
    const cancelledAppointment = await appointmentsService.cancelAppointment(
      customerAuth,
      selfBooking.appointment.id,
    );
    assert(
      cancelledAppointment.status === "cancelled",
      "Customers can cancel their own future confirmed appointments",
    );
    const lifecycleAudit = await pool.query<{ action: string }>(
      "SELECT action FROM appointment_audit_events WHERE appointment_id = $1 ORDER BY created_at",
      [selfBooking.appointment.id],
    );
    assert(
      lifecycleAudit.rows.map(({ action }) => action).join(",") ===
        "rescheduled,cancelled",
      "Rescheduling and cancellation append ordered audit events",
    );

    const mountainDealershipId = "11111111-1111-4111-8111-111111111112";
    const mountainCustomerId = "55555555-5555-4555-8555-555555555556";
    const mountainVehicleId = "66666666-6666-4666-8666-666666666667";
    const mountainStandardServiceId = "22222222-2222-4222-8222-222222222222";
    const mountainDate = nextWeekdayDate("America/Denver");
    const mountainAvailability = await availabilityService.getAvailability(
      ownerAuth,
      {
        dealershipId: mountainDealershipId,
        customerId: mountainCustomerId,
        vehicleId: mountainVehicleId,
        serviceTypeId: mountainStandardServiceId,
        date: mountainDate,
      },
    );
    const assistedSlot = mountainAvailability.slots[0];
    assert(
      assistedSlot !== undefined,
      "Expected an available staff-assisted slot",
    );
    const assistedBooking = await appointmentsService.createStaffAssisted(
      ownerAuth,
      {
        dealershipId: mountainDealershipId,
        customerId: mountainCustomerId,
        vehicleId: mountainVehicleId,
        serviceTypeId: mountainStandardServiceId,
        startsAt: assistedSlot.startsAt,
      },
      `staff-${randomUUID()}`,
    );
    assert(
      assistedBooking.appointment.customerId === mountainCustomerId &&
        assistedBooking.appointment.vehicleId === mountainVehicleId &&
        assistedBooking.appointment.bookingChannel === "staff_assisted" &&
        assistedBooking.appointment.durationMinutesSnapshot === 75,
      "Staff-assisted booking uses the selected associated customer and dealership duration",
    );

    const historicalAppointments = await Promise.all(
      ["2020-01-06T17:00:00.000Z", "2020-01-07T17:00:00.000Z"].map(
        async (startsAtString) => {
          const startsAt = new Date(startsAtString);
          const [appointment] = await db
            .insert(schema.appointments)
            .values({
              appointmentRef: `APPT-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`,
              customerId: sampleCustomer.id,
              vehicleId: sampleVehicleId,
              dealershipId: sampleDealershipId,
              serviceTypeId: sampleServiceTypeId,
              assignedTechnicianId: "33333333-3333-4333-8333-333333333333",
              assignedBayId: "44444444-4444-4444-8444-444444444444",
              createdByUserId: ownerAuth.userId,
              bookingChannel: "customer_self_service",
              status: "confirmed",
              startsAt,
              endsAt: new Date(startsAt.getTime() + 60 * 60_000),
              serviceNameSnapshot: "Standard Service",
              durationMinutesSnapshot: 60,
            })
            .returning();
          assert(
            appointment !== undefined,
            "Historical appointment is created",
          );
          return appointment;
        },
      ),
    );
    await expectError(
      () =>
        appointmentsService.updateAppointmentStatus(
          customerAuth,
          historicalAppointments[0].id,
          "completed",
        ),
      NotFoundException,
      "Customers cannot mark appointments completed or no-show",
    );
    const completedAppointment =
      await appointmentsService.updateAppointmentStatus(
        staffAuth,
        historicalAppointments[0].id,
        "completed",
      );
    const noShowAppointment = await appointmentsService.updateAppointmentStatus(
      staffAuth,
      historicalAppointments[1].id,
      "no_show",
    );
    assert(
      completedAppointment.status === "completed" &&
        noShowAppointment.status === "no_show",
      "Dealership staff can mark elapsed appointments completed or no-show",
    );
    const statusAudit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM appointment_audit_events WHERE appointment_id = ANY($1::uuid[]) AND action IN ('completed', 'no_show')",
      [[historicalAppointments[0].id, historicalAppointments[1].id]],
    );
    assert(
      statusAudit.rows[0].count === "2",
      "Staff status changes append lifecycle audit events",
    );
    const pastAppointments = await appointmentsService.listCustomerAppointments(
      customerAuth,
      { period: "past", limit: 50, offset: 0 },
    );
    assert(
      pastAppointments.items.some(({ id }) => id === completedAppointment.id) &&
        pastAppointments.items.some(({ id }) => id === noShowAppointment.id),
      "Customer past history includes terminal appointment records",
    );

    await expectError(
      () =>
        availabilityService.getAvailability(ownerAuth, {
          dealershipId: sampleDealershipId,
          vehicleId: sampleVehicleId,
          serviceTypeId: sampleServiceTypeId,
          date: availabilityDate,
        }),
      BadRequestException,
      "Staff-assisted availability requires a customerId",
    );
    await expectError(
      () =>
        availabilityService.getAvailability(customerAuth, {
          dealershipId: sampleDealershipId,
          vehicleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          serviceTypeId: sampleServiceTypeId,
          date: availabilityDate,
        }),
      NotFoundException,
      "An unassigned vehicle cannot be used for dealership availability",
    );
    await expectError(
      () =>
        availabilityService.getAvailability(customerAuth, {
          dealershipId: "11111111-1111-4111-8111-111111111112",
          vehicleId: sampleVehicleId,
          serviceTypeId: sampleServiceTypeId,
          date: availabilityDate,
        }),
      NotFoundException,
      "A vehicle assignment at another dealership does not grant access here",
    );
    await expectError(
      () =>
        availabilityService.getAvailability(customerAuth, {
          dealershipId: sampleDealershipId,
          vehicleId: sampleVehicleId,
          serviceTypeId: sampleServiceTypeId,
          date: addCalendarDays(availabilityDate, 61),
        }),
      BadRequestException,
      "Availability date must stay within the 60-day booking horizon",
    );
    await expectError(
      () =>
        techniciansService.deleteQualification(
          ownerAuth,
          "11111111-1111-4111-8111-111111111111",
          "33333333-3333-4333-8333-333333333333",
          "22222222-2222-4222-8222-222222222222",
        ),
      ConflictException,
      "Appointment history must prevent deleting its technician qualification",
    );
    await expectError(
      () =>
        serviceBaysService.deleteCapability(
          ownerAuth,
          "11111111-1111-4111-8111-111111111111",
          "44444444-4444-4444-8444-444444444444",
          "22222222-2222-4222-8222-222222222222",
        ),
      ConflictException,
      "Appointment history must prevent deleting its bay capability",
    );
    const seedDealershipVehicles =
      await vehiclesService.listForDealershipCustomer(
        ownerAuth,
        "11111111-1111-4111-8111-111111111111",
        sampleCustomer.id,
      );
    assert(
      seedDealershipVehicles.some(
        (vehicle) => vehicle.id === "66666666-6666-4666-8666-666666666666",
      ) &&
        !seedDealershipVehicles.some(
          (vehicle) => vehicle.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ),
      "Dealership staff must only see explicitly assigned customer vehicles",
    );

    const suffix = randomUUID().slice(0, 8);
    const dealership = await dealershipsService.create(customerAuth, {
      name: `Domain Test ${suffix}`,
      addressLine1: "1 Integration Way",
      city: "Test City",
      region: "CA",
      postalCode: "90001",
      countryCode: "US",
      timezone: "America/Los_Angeles",
    });
    const newOwnerAuth = await authService.authenticateBearerToken(
      customerToken.accessToken,
    );
    assert(
      newOwnerAuth.memberships.some(
        (membership) =>
          membership.dealershipId === dealership.id &&
          membership.role === "owner",
      ),
      "Dealership creation must atomically make its creator the owner",
    );
    assert(
      await customersService.isLinkedToDealership(
        dealership.id,
        sampleCustomer.id,
      ),
      "A customer creating a dealership is associated with it for staff workflows",
    );
    assert(
      (
        await vehiclesService.listForDealershipCustomer(
          newOwnerAuth,
          dealership.id,
          sampleCustomer.id,
        )
      ).length === 0,
      "Customer association alone must not expose any of their vehicles",
    );
    await vehiclesService.assignOwnedVehicleToDealership(
      customerAuth,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      dealership.id,
    );
    const assignedVehicles = await vehiclesService.listForDealershipCustomer(
      newOwnerAuth,
      dealership.id,
      sampleCustomer.id,
    );
    assert(
      assignedVehicles.length === 1 &&
        assignedVehicles[0].id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Customer vehicle assignment exposes only the selected vehicle to the dealership",
    );
    await expectError(
      () =>
        vehiclesService.updateForDealership(
          newOwnerAuth,
          dealership.id,
          "66666666-6666-4666-8666-666666666666",
          { make: "Unauthorized update" },
        ),
      NotFoundException,
      "Staff cannot update a customer's vehicle unless it is assigned to their dealership",
    );
    const existingAssociation = await dealershipsService.associateCustomer(
      customerAuth,
      dealership.id,
    );
    assert(
      existingAssociation.customerId === sampleCustomer.id,
      "Customer can idempotently associate their profile with a dealership",
    );
    assert(
      (await dealershipsService.listForCustomer(customerAuth)).some(
        (entry) => entry.id === dealership.id,
      ),
      "Customer dealership list includes the selected active dealership",
    );
    await expectError(
      () => dealershipsService.associateCustomer(staffAuth, dealership.id),
      ForbiddenException,
      "Only a customer principal can initiate a dealership association",
    );

    await expectError(
      () =>
        dealershipsService.update(ownerAuth, dealership.id, {
          name: "Unauthorized edit",
        }),
      ForbiddenException,
      "An owner of another dealership must not edit this dealership",
    );
    await expectError(
      () => customersService.listByDealership(staffAuth, dealership.id),
      ForbiddenException,
      "Staff from another dealership must not list this dealership's customers",
    );

    await dealershipsService.update(newOwnerAuth, dealership.id, {
      name: `Updated Domain Test ${suffix}`,
    });
    assert(
      (await dealershipsService.list()).some(
        (entry) => entry.id === dealership.id,
      ),
      "Active dealership should appear in the authenticated list",
    );

    const mondayHours = await dealershipsService.createHour(
      newOwnerAuth,
      dealership.id,
      {
        dayOfWeek: 1,
        openTime: "08:00:00",
        closeTime: "17:00:00",
      },
    );
    assert(
      (await dealershipsService.listHours(customerAuth, dealership.id)).some(
        (entry) => entry.id === mondayHours.id,
      ),
      "Customer can read active dealership operating hours",
    );
    await expectError(
      () =>
        dealershipsService.createHour(newOwnerAuth, dealership.id, {
          dayOfWeek: 1,
          openTime: "09:00:00",
          closeTime: "17:00:00",
        }),
      ConflictException,
      "A dealership cannot have duplicate weekly hours for one day",
    );
    await expectError(
      () =>
        dealershipsService.updateHour(
          newOwnerAuth,
          dealership.id,
          mondayHours.id,
          {
            closeTime: "07:00:00",
          },
        ),
      BadRequestException,
      "Dealership hours must have a positive time window",
    );
    await dealershipsService.updateHour(
      newOwnerAuth,
      dealership.id,
      mondayHours.id,
      { isClosed: true },
    );
    assert(
      (await dealershipsService.listHours(newOwnerAuth, dealership.id)).some(
        (entry) =>
          entry.id === mondayHours.id &&
          entry.isClosed &&
          entry.openTime === null &&
          entry.closeTime === null,
      ),
      "Closing a weekly schedule day clears its local-time window",
    );

    const closure = await dealershipsService.createClosure(
      newOwnerAuth,
      dealership.id,
      {
        startsAt: "2027-12-25T00:00:00.000Z",
        endsAt: "2027-12-26T00:00:00.000Z",
        reason: "Holiday",
      },
    );
    await expectError(
      () =>
        dealershipsService.updateClosure(
          newOwnerAuth,
          dealership.id,
          closure.id,
          {
            endsAt: "2027-12-24T00:00:00.000Z",
          },
        ),
      BadRequestException,
      "Closure updates must retain a positive time window",
    );
    await dealershipsService.updateClosure(
      newOwnerAuth,
      dealership.id,
      closure.id,
      { reason: "Updated holiday" },
    );
    assert(
      (await dealershipsService.listClosures(customerAuth, dealership.id)).some(
        (entry) =>
          entry.id === closure.id && entry.reason === "Updated holiday",
      ),
      "Closure changes are visible to authorized readers",
    );
    await dealershipsService.deleteClosure(
      newOwnerAuth,
      dealership.id,
      closure.id,
    );
    await expectError(
      () => dealershipsService.listHours(staffAuth, dealership.id),
      ForbiddenException,
      "Staff without membership cannot read another dealership's schedule",
    );

    const customerA = await customersService.createForDealership(
      newOwnerAuth,
      dealership.id,
      {
        email: `domain-customer-a-${suffix}@example.test`,
        firstName: "Morgan",
        lastName: "One",
      },
    );
    const customerB = await customersService.createForDealership(
      newOwnerAuth,
      dealership.id,
      {
        email: `domain-customer-b-${suffix}@example.test`,
        firstName: "Morgan",
        lastName: "Two",
      },
    );
    assert(
      (await customersService.listByDealership(newOwnerAuth, dealership.id))
        .length === 3,
      "Dealership customer list includes its customer creator and newly added profiles",
    );
    await expectError(
      () =>
        customersService.getForDealership(
          staffAuth,
          dealership.id,
          customerA.id,
        ),
      ForbiddenException,
      "Customer records must remain scoped to the dealership membership",
    );
    await customersService.updateForDealership(
      newOwnerAuth,
      dealership.id,
      customerA.id,
      {
        firstName: "Updated Morgan",
      },
    );

    const vehicle = await vehiclesService.createForCustomer(
      newOwnerAuth,
      dealership.id,
      customerA.id,
      {
        vin: `1HGCM82633${suffix.toUpperCase()}`.slice(0, 17),
        make: "Honda",
        model: "Accord",
        year: 2022,
      },
    );
    await expectError(
      () =>
        vehiclesService.assignOwnedVehicleToDealership(
          customerAuth,
          vehicle.id,
          dealership.id,
        ),
      NotFoundException,
      "A customer who does not own a vehicle cannot assign it to another dealership",
    );
    assert(
      (
        await vehiclesService.listForDealershipCustomer(
          newOwnerAuth,
          dealership.id,
          customerA.id,
        )
      ).some((entry) => entry.id === vehicle.id),
      "Dealership customer vehicle list includes owned vehicles",
    );
    await vehiclesService.grantAccess(
      newOwnerAuth,
      dealership.id,
      customerB.id,
      vehicle.id,
    );
    assert(
      (
        await vehiclesService.listForDealershipCustomer(
          newOwnerAuth,
          dealership.id,
          customerB.id,
        )
      ).some((entry) => entry.id === vehicle.id),
      "Explicit customer vehicle access is reflected in dealership queries",
    );
    await vehiclesService.revokeAccess(
      newOwnerAuth,
      dealership.id,
      customerB.id,
      vehicle.id,
    );
    assert(
      !(
        await vehiclesService.listForDealershipCustomer(
          newOwnerAuth,
          dealership.id,
          customerB.id,
        )
      ).some((entry) => entry.id === vehicle.id),
      "Revoked vehicle access no longer appears in customer queries",
    );

    const serviceType = await serviceCatalogService.createServiceType(
      newOwnerAuth,
      {
        name: `Domain Test Service ${suffix}`,
        description: "Integration-test catalog item",
      },
    );

    const technician = await techniciansService.create(
      newOwnerAuth,
      dealership.id,
      { displayName: "Domain Test Technician", employeeCode: `TECH-${suffix}` },
    );
    await expectError(
      () => techniciansService.listByDealership(staffAuth, dealership.id),
      ForbiddenException,
      "Staff from another dealership cannot list technicians",
    );
    await techniciansService.createQualification(
      newOwnerAuth,
      dealership.id,
      technician.id,
      {
        serviceTypeId: serviceType.id,
        validFrom: "2027-01-01T00:00:00.000Z",
        validTo: "2028-01-01T00:00:00.000Z",
      },
    );
    await expectError(
      () =>
        techniciansService.createQualification(
          newOwnerAuth,
          dealership.id,
          technician.id,
          {
            serviceTypeId: serviceType.id,
            validFrom: "2028-01-01T00:00:00.000Z",
            validTo: "2027-01-01T00:00:00.000Z",
          },
        ),
      BadRequestException,
      "Qualification validity must be a positive window",
    );
    assert(
      (
        await techniciansService.listQualifications(
          newOwnerAuth,
          dealership.id,
          technician.id,
        )
      ).length === 1,
      "Technician qualification can be listed within its dealership scope",
    );
    await techniciansService.createShift(
      newOwnerAuth,
      dealership.id,
      technician.id,
      {
        dayOfWeek: 1,
        startLocalTime: "08:00:00",
        endLocalTime: "16:00:00",
      },
    );
    await expectError(
      () =>
        techniciansService.createShift(
          newOwnerAuth,
          dealership.id,
          technician.id,
          {
            dayOfWeek: 2,
            startLocalTime: "17:00:00",
            endLocalTime: "09:00:00",
          },
        ),
      BadRequestException,
      "Technician shift must end after it starts",
    );
    const [shift] = await techniciansService.listShifts(
      newOwnerAuth,
      dealership.id,
      technician.id,
    );
    assert(shift !== undefined, "Technician shift should be listed");
    await techniciansService.updateShift(
      newOwnerAuth,
      dealership.id,
      technician.id,
      shift.id,
      { isActive: false },
    );
    assert(
      !(
        await techniciansService.listShifts(
          newOwnerAuth,
          dealership.id,
          technician.id,
        )
      )[0].isActive,
      "Technician weekly shift can be deactivated without deleting it",
    );

    const leave = await techniciansService.createLeave(
      newOwnerAuth,
      dealership.id,
      technician.id,
      {
        startsAt: "2027-02-01T09:00:00.000Z",
        endsAt: "2027-02-02T17:00:00.000Z",
        reason: "Training",
      },
    );
    await expectError(
      () =>
        techniciansService.updateLeave(
          newOwnerAuth,
          dealership.id,
          technician.id,
          leave.id,
          {
            endsAt: "2027-01-31T09:00:00.000Z",
          },
        ),
      BadRequestException,
      "Technician leave must retain a positive time window",
    );
    await techniciansService.updateLeave(
      newOwnerAuth,
      dealership.id,
      technician.id,
      leave.id,
      { reason: "Updated training" },
    );
    assert(
      (
        await techniciansService.listLeaves(
          newOwnerAuth,
          dealership.id,
          technician.id,
        )
      ).some((entry) => entry.id === leave.id),
      "Technician leave can be read and updated within dealership scope",
    );
    await techniciansService.deleteLeave(
      newOwnerAuth,
      dealership.id,
      technician.id,
      leave.id,
    );

    const serviceBay = await serviceBaysService.create(
      newOwnerAuth,
      dealership.id,
      { bayCode: `DOMAIN-${suffix}` },
    );
    await serviceBaysService.createCapability(
      newOwnerAuth,
      dealership.id,
      serviceBay.id,
      { serviceTypeId: serviceType.id },
    );
    assert(
      (
        await serviceBaysService.listCapabilities(
          customerAuth,
          dealership.id,
          serviceBay.id,
        )
      ).some((entry) => entry.serviceTypeId === serviceType.id),
      "Bay service capabilities can be configured and read",
    );
    await expectError(
      () =>
        serviceBaysService.createCapability(
          newOwnerAuth,
          dealership.id,
          serviceBay.id,
          { serviceTypeId: serviceType.id },
        ),
      ConflictException,
      "Bay service capability cannot be duplicated",
    );
    await serviceBaysService.update(
      newOwnerAuth,
      dealership.id,
      serviceBay.id,
      {
        isActive: false,
      },
    );
    assert(
      !(
        await serviceBaysService.listByDealership(newOwnerAuth, dealership.id)
      ).find((entry) => entry.id === serviceBay.id)?.isActive,
      "Service bay can be deactivated without deleting it",
    );
    await serviceBaysService.update(
      newOwnerAuth,
      dealership.id,
      serviceBay.id,
      {
        isActive: true,
      },
    );
    await serviceBaysService.deleteCapability(
      newOwnerAuth,
      dealership.id,
      serviceBay.id,
      serviceType.id,
    );
    const offering = await serviceCatalogService.createDealershipService(
      newOwnerAuth,
      dealership.id,
      { serviceTypeId: serviceType.id, durationMinutes: 45 },
    );
    await serviceCatalogService.updateDealershipService(
      newOwnerAuth,
      dealership.id,
      offering.id,
      { durationMinutes: 50 },
    );
    assert(
      (await serviceCatalogService.listDealershipServices(dealership.id)).some(
        (entry) => entry.id === offering.id && entry.durationMinutes === 50,
      ),
      "Dealership service listing reflects dealership-specific duration",
    );

    console.log(
      "Domain integration checks passed: dealership ownership, explicit dealership vehicle assignments, customer/vehicle access, service catalog, and dealership offerings.",
    );
  } finally {
    await pool.end();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
