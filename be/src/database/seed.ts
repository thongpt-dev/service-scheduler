import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "../auth/security.util";
import * as schema from "./schema";

const seedIds = {
  dealership: "11111111-1111-4111-8111-111111111111",
  mountainDealership: "11111111-1111-4111-8111-111111111112",
  cityDealership: "11111111-1111-4111-8111-111111111113",
  serviceType: "22222222-2222-4222-8222-222222222222",
  brakeServiceType: "22222222-2222-4222-8222-222222222223",
  diagnosticsServiceType: "22222222-2222-4222-8222-222222222224",
  tireServiceType: "22222222-2222-4222-8222-222222222225",
  technician: "33333333-3333-4333-8333-333333333333",
  mountainTechnician: "33333333-3333-4333-8333-333333333334",
  diagnosticsTechnician: "33333333-3333-4333-8333-333333333335",
  cityTechnician: "33333333-3333-4333-8333-333333333336",
  bay: "44444444-4444-4444-8444-444444444444",
  mountainBay: "44444444-4444-4444-8444-444444444445",
  mountainDiagnosticsBay: "44444444-4444-4444-8444-444444444446",
  cityBay: "44444444-4444-4444-8444-444444444447",
  customer: "55555555-5555-4555-8555-555555555555",
  secondCustomer: "55555555-5555-4555-8555-555555555556",
  thirdCustomer: "55555555-5555-4555-8555-555555555557",
  vehicle: "66666666-6666-4666-8666-666666666666",
  mountainVehicle: "66666666-6666-4666-8666-666666666667",
  mountainSecondVehicle: "66666666-6666-4666-8666-666666666668",
  cityVehicle: "66666666-6666-4666-8666-666666666669",
  customerUser: "99999999-9999-4999-8999-999999999999",
  unassignedVehicle: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner: "77777777-7777-4777-8777-777777777777",
  staff: "88888888-8888-4888-8888-888888888888",
  manager: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
  firstClosure: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  secondClosure: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  firstLeave: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  secondLeave: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  shifts: [
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd5",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd6",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd7",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd8",
    "dddddddd-dddd-4ddd-8ddd-ddddddddddd9",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd10",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd11",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd12",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd13",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd14",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd15",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd16",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd17",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd18",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd19",
    "dddddddd-dddd-4ddd-8ddd-dddddddddd20",
  ],
};

type SeedDealershipRole =
  (typeof schema.dealershipMembershipRoleEnum.enumValues)[number];

interface SeedDealershipMembership {
  dealershipId: string;
  role: SeedDealershipRole;
}

interface DemoAccount {
  id: string;
  email: string;
  password: string;
  memberships: SeedDealershipMembership[];
}

const demoAccounts = [
  {
    id: seedIds.customerUser,
    email: "sample.customer@example.test",
    password: "LocalCustomerPass123!",
    memberships: [],
  },
  {
    id: seedIds.owner,
    email: "sample.owner@example.test",
    password: "LocalOwnerPass123!",
    memberships: [
      { dealershipId: seedIds.dealership, role: "owner" },
      { dealershipId: seedIds.mountainDealership, role: "owner" },
      { dealershipId: seedIds.cityDealership, role: "owner" },
    ],
  },
  {
    id: seedIds.staff,
    email: "sample.staff@example.test",
    password: "LocalStaffPass123!",
    memberships: [
      { dealershipId: seedIds.dealership, role: "staff" },
      { dealershipId: seedIds.mountainDealership, role: "staff" },
    ],
  },
  {
    id: seedIds.manager,
    email: "sample.manager@example.test",
    password: "LocalManagerPass123!",
    memberships: [
      { dealershipId: seedIds.mountainDealership, role: "manager" },
    ],
  },
] satisfies DemoAccount[];

function utcDateAfter(days: number, hour = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function makeWeeklyHours(
  dealershipId: string,
  openDays: number[],
  openTime: string,
  closeTime: string,
  saturdayHours?: { openTime: string; closeTime: string },
) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const saturday = dayOfWeek === 6 ? saturdayHours : undefined;
    const isOpen = openDays.includes(dayOfWeek) || saturday !== undefined;
    return {
      dealershipId,
      dayOfWeek,
      openTime: isOpen ? (saturday?.openTime ?? openTime) : null,
      closeTime: isOpen ? (saturday?.closeTime ?? closeTime) : null,
      isClosed: !isOpen,
    };
  });
}

async function seedDatabase(): Promise<void> {
  if (!new Set(["development", "test"]).has(process.env.NODE_ENV ?? "")) {
    throw new Error(
      "Development seed data requires NODE_ENV=development or NODE_ENV=test",
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });

  try {
    await db
      .insert(schema.dealerships)
      .values([
        {
          id: seedIds.dealership,
          name: "Sample Service Center",
          addressLine1: "100 Example Way",
          city: "Springfield",
          region: "CA",
          postalCode: "90000",
          countryCode: "US",
          timezone: "America/Los_Angeles",
        },
        {
          id: seedIds.mountainDealership,
          name: "Mountain View Auto Care",
          addressLine1: "2400 Ridge Road",
          city: "Boulder",
          region: "CO",
          postalCode: "80301",
          countryCode: "US",
          timezone: "America/Denver",
        },
        {
          id: seedIds.cityDealership,
          name: "Eastside Motor Works",
          addressLine1: "75 Harbor Street",
          city: "Boston",
          region: "MA",
          postalCode: "02110",
          countryCode: "US",
          timezone: "America/New_York",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.serviceTypes)
      .values([
        {
          id: seedIds.serviceType,
          name: "Standard Maintenance",
          description: "Routine inspection and maintenance service.",
        },
        {
          id: seedIds.brakeServiceType,
          name: "Brake Service",
          description: "Brake inspection, pad replacement, and rotor service.",
        },
        {
          id: seedIds.diagnosticsServiceType,
          name: "Diagnostic Inspection",
          description: "Electronic and drivability diagnostics.",
        },
        {
          id: seedIds.tireServiceType,
          name: "Tire Service",
          description: "Tire rotation, balancing, and replacement.",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipServices)
      .values([
        {
          dealershipId: seedIds.dealership,
          serviceTypeId: seedIds.serviceType,
          durationMinutes: 60,
        },
        {
          dealershipId: seedIds.mountainDealership,
          serviceTypeId: seedIds.serviceType,
          durationMinutes: 75,
        },
        {
          dealershipId: seedIds.mountainDealership,
          serviceTypeId: seedIds.brakeServiceType,
          durationMinutes: 120,
        },
        {
          dealershipId: seedIds.mountainDealership,
          serviceTypeId: seedIds.diagnosticsServiceType,
          durationMinutes: 90,
        },
        {
          dealershipId: seedIds.cityDealership,
          serviceTypeId: seedIds.serviceType,
          durationMinutes: 90,
        },
        {
          dealershipId: seedIds.cityDealership,
          serviceTypeId: seedIds.tireServiceType,
          durationMinutes: 45,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipHours)
      .values([
        ...makeWeeklyHours(
          seedIds.dealership,
          [1, 2, 3, 4, 5],
          "09:00",
          "17:00",
        ),
        ...makeWeeklyHours(
          seedIds.mountainDealership,
          [1, 2, 3, 4, 5],
          "08:00",
          "18:00",
          { openTime: "09:00", closeTime: "14:00" },
        ),
        ...makeWeeklyHours(
          seedIds.cityDealership,
          [1, 2, 3, 4, 5],
          "07:30",
          "17:30",
          { openTime: "08:00", closeTime: "13:00" },
        ),
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.technicians)
      .values([
        {
          id: seedIds.technician,
          dealershipId: seedIds.dealership,
          displayName: "Sample Technician",
          employeeCode: "TECH-001",
        },
        {
          id: seedIds.mountainTechnician,
          dealershipId: seedIds.mountainDealership,
          displayName: "Jordan Lee",
          employeeCode: "MOUNTAIN-01",
        },
        {
          id: seedIds.diagnosticsTechnician,
          dealershipId: seedIds.mountainDealership,
          displayName: "Riley Morgan",
          employeeCode: "MOUNTAIN-02",
        },
        {
          id: seedIds.cityTechnician,
          dealershipId: seedIds.cityDealership,
          displayName: "Taylor Brooks",
          employeeCode: "EASTSIDE-01",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.technicianQualifications)
      .values([
        {
          technicianId: seedIds.technician,
          serviceTypeId: seedIds.serviceType,
        },
        {
          technicianId: seedIds.mountainTechnician,
          serviceTypeId: seedIds.serviceType,
        },
        {
          technicianId: seedIds.mountainTechnician,
          serviceTypeId: seedIds.brakeServiceType,
        },
        {
          technicianId: seedIds.diagnosticsTechnician,
          serviceTypeId: seedIds.brakeServiceType,
        },
        {
          technicianId: seedIds.diagnosticsTechnician,
          serviceTypeId: seedIds.diagnosticsServiceType,
        },
        {
          technicianId: seedIds.cityTechnician,
          serviceTypeId: seedIds.serviceType,
        },
        {
          technicianId: seedIds.cityTechnician,
          serviceTypeId: seedIds.tireServiceType,
        },
      ])
      .onConflictDoNothing();

    let shiftIndex = 0;
    const makeShifts = (
      technicianId: string,
      days: number[],
      startLocalTime: string,
      endLocalTime: string,
    ) =>
      days.map((dayOfWeek) => ({
        id: seedIds.shifts[shiftIndex++],
        technicianId,
        dayOfWeek,
        startLocalTime,
        endLocalTime,
      }));

    await db
      .insert(schema.technicianShifts)
      .values([
        ...makeShifts(seedIds.technician, [1, 2, 3, 4, 5], "09:00", "17:00"),
        ...makeShifts(
          seedIds.mountainTechnician,
          [1, 2, 3, 4, 5],
          "08:00",
          "16:00",
        ),
        ...makeShifts(seedIds.mountainTechnician, [6], "09:00", "14:00"),
        ...makeShifts(
          seedIds.diagnosticsTechnician,
          [2, 3, 4, 5, 6],
          "10:00",
          "18:00",
        ),
        ...makeShifts(seedIds.cityTechnician, [1, 2, 3, 4], "07:30", "16:00"),
      ])
      .onConflictDoNothing();

    const firstLeaveStartsAt = utcDateAfter(14, 9);
    const firstLeaveEndsAt = utcDateAfter(16, 17);
    const secondLeaveStartsAt = utcDateAfter(35, 8);
    const secondLeaveEndsAt = utcDateAfter(36, 17);
    const demoLeaves = [
      {
        id: seedIds.firstLeave,
        technicianId: seedIds.mountainTechnician,
        startsAt: firstLeaveStartsAt,
        endsAt: firstLeaveEndsAt,
        reason: "Demo training leave",
      },
      {
        id: seedIds.secondLeave,
        technicianId: seedIds.cityTechnician,
        startsAt: secondLeaveStartsAt,
        endsAt: secondLeaveEndsAt,
        reason: "Demo annual leave",
      },
    ];
    for (const leave of demoLeaves) {
      await db
        .insert(schema.technicianLeaves)
        .values(leave)
        .onConflictDoUpdate({
          target: schema.technicianLeaves.id,
          set: {
            technicianId: leave.technicianId,
            startsAt: leave.startsAt,
            endsAt: leave.endsAt,
            reason: leave.reason,
            updatedAt: new Date(),
          },
        });
    }

    const firstClosureStartsAt = utcDateAfter(21);
    const firstClosureEndsAt = utcDateAfter(22);
    const secondClosureStartsAt = utcDateAfter(45);
    const secondClosureEndsAt = utcDateAfter(46);
    const demoClosures = [
      {
        id: seedIds.firstClosure,
        dealershipId: seedIds.dealership,
        startsAt: firstClosureStartsAt,
        endsAt: firstClosureEndsAt,
        reason: "Demo scheduled maintenance closure",
      },
      {
        id: seedIds.secondClosure,
        dealershipId: seedIds.mountainDealership,
        startsAt: secondClosureStartsAt,
        endsAt: secondClosureEndsAt,
        reason: "Demo regional holiday closure",
      },
    ];
    for (const closure of demoClosures) {
      await db
        .insert(schema.dealershipClosures)
        .values(closure)
        .onConflictDoUpdate({
          target: schema.dealershipClosures.id,
          set: {
            dealershipId: closure.dealershipId,
            startsAt: closure.startsAt,
            endsAt: closure.endsAt,
            reason: closure.reason,
            updatedAt: new Date(),
          },
        });
    }

    await db
      .insert(schema.serviceBays)
      .values([
        {
          id: seedIds.bay,
          dealershipId: seedIds.dealership,
          bayCode: "BAY-01",
        },
        {
          id: seedIds.mountainBay,
          dealershipId: seedIds.mountainDealership,
          bayCode: "MOUNTAIN-01",
        },
        {
          id: seedIds.mountainDiagnosticsBay,
          dealershipId: seedIds.mountainDealership,
          bayCode: "MOUNTAIN-DIAG",
        },
        {
          id: seedIds.cityBay,
          dealershipId: seedIds.cityDealership,
          bayCode: "EASTSIDE-01",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.bayServiceCapabilities)
      .values([
        { bayId: seedIds.bay, serviceTypeId: seedIds.serviceType },
        { bayId: seedIds.mountainBay, serviceTypeId: seedIds.serviceType },
        { bayId: seedIds.mountainBay, serviceTypeId: seedIds.brakeServiceType },
        {
          bayId: seedIds.mountainDiagnosticsBay,
          serviceTypeId: seedIds.brakeServiceType,
        },
        {
          bayId: seedIds.mountainDiagnosticsBay,
          serviceTypeId: seedIds.diagnosticsServiceType,
        },
        { bayId: seedIds.cityBay, serviceTypeId: seedIds.serviceType },
        { bayId: seedIds.cityBay, serviceTypeId: seedIds.tireServiceType },
      ])
      .onConflictDoNothing();

    await seedDemoAccounts(db);

    await db
      .insert(schema.customers)
      .values({
        id: seedIds.customer,
        userId: seedIds.customerUser,
        email: "sample.customer@example.test",
        firstName: "Sample",
        lastName: "Customer",
      })
      .onConflictDoUpdate({
        target: schema.customers.email,
        set: { userId: seedIds.customerUser },
      });

    await db
      .insert(schema.customers)
      .values({
        id: seedIds.secondCustomer,
        email: "sample.customer.two@example.test",
        firstName: "Morgan",
        lastName: "Ridge",
        phone: "+13035550124",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.customers)
      .values({
        id: seedIds.thirdCustomer,
        email: "sample.customer.three@example.test",
        firstName: "Casey",
        lastName: "Harbor",
        phone: "+16175550125",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipCustomers)
      .values({
        dealershipId: seedIds.dealership,
        customerId: seedIds.customer,
        createdByUserId: seedIds.owner,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipCustomers)
      .values([
        {
          dealershipId: seedIds.mountainDealership,
          customerId: seedIds.customer,
          createdByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.mountainDealership,
          customerId: seedIds.secondCustomer,
          createdByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.mountainDealership,
          customerId: seedIds.thirdCustomer,
          createdByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.cityDealership,
          customerId: seedIds.thirdCustomer,
          createdByUserId: seedIds.owner,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.vehicles)
      .values([
        {
          id: seedIds.vehicle,
          ownerCustomerId: seedIds.customer,
          vin: "SAMPLE12345678901",
          make: "Example Motors",
          model: "Development Vehicle",
          year: 2022,
        },
        {
          id: seedIds.unassignedVehicle,
          ownerCustomerId: seedIds.customer,
          vin: "SAMPLE12345678902",
          make: "Example Motors",
          model: "Unassigned Development Vehicle",
          year: 2023,
        },
        {
          id: seedIds.mountainVehicle,
          ownerCustomerId: seedIds.secondCustomer,
          vin: "SAMPLE12345678903",
          make: "Subaru",
          model: "Outback",
          year: 2021,
        },
        {
          id: seedIds.mountainSecondVehicle,
          ownerCustomerId: seedIds.secondCustomer,
          vin: "SAMPLE12345678904",
          make: "Toyota",
          model: "RAV4",
          year: 2024,
        },
        {
          id: seedIds.cityVehicle,
          ownerCustomerId: seedIds.thirdCustomer,
          vin: "SAMPLE12345678905",
          make: "Honda",
          model: "Civic",
          year: 2023,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipVehicles)
      .values([
        {
          dealershipId: seedIds.dealership,
          vehicleId: seedIds.vehicle,
          assignedByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.mountainDealership,
          vehicleId: seedIds.mountainVehicle,
          assignedByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.mountainDealership,
          vehicleId: seedIds.mountainSecondVehicle,
          assignedByUserId: seedIds.owner,
        },
        {
          dealershipId: seedIds.cityDealership,
          vehicleId: seedIds.cityVehicle,
          assignedByUserId: seedIds.owner,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.customerVehicleAccess)
      .values({
        customerId: seedIds.thirdCustomer,
        vehicleId: seedIds.mountainVehicle,
      })
      .onConflictDoNothing();
  } finally {
    await pool.end();
  }
}

async function seedDemoAccounts(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const account of demoAccounts) {
      const [existingUser] = await tx
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, account.id))
        .limit(1);

      if (existingUser && existingUser.email !== account.email) {
        throw new Error(`Seed account ID is already in use: ${account.id}`);
      }

      if (!existingUser) {
        const [emailOwner] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, account.email))
          .limit(1);
        if (emailOwner) {
          throw new Error(
            `Seed account email is already in use: ${account.email}`,
          );
        }

        await tx
          .insert(schema.users)
          .values({
            id: account.id,
            email: account.email,
            passwordHash: await hashPassword(account.password),
          })
          .onConflictDoNothing();
      }

      const [seededUser] = await tx
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, account.id))
        .limit(1);
      if (!seededUser || seededUser.email !== account.email) {
        throw new Error(`Could not create seed account: ${account.email}`);
      }

      for (const membershipSeed of account.memberships) {
        const [dealership] = await tx
          .select({ id: schema.dealerships.id })
          .from(schema.dealerships)
          .where(
            and(
              eq(schema.dealerships.id, membershipSeed.dealershipId),
              eq(schema.dealerships.isActive, true),
            ),
          )
          .limit(1);
        if (!dealership) {
          throw new Error(
            `Seed dealership is missing or inactive: ${membershipSeed.dealershipId}`,
          );
        }

        const [membership] = await tx
          .select({
            id: schema.dealershipMemberships.id,
            role: schema.dealershipMemberships.role,
            isActive: schema.dealershipMemberships.isActive,
          })
          .from(schema.dealershipMemberships)
          .where(
            and(
              eq(
                schema.dealershipMemberships.dealershipId,
                membershipSeed.dealershipId,
              ),
              eq(schema.dealershipMemberships.userId, account.id),
            ),
          )
          .limit(1);

        if (!membership) {
          await tx.insert(schema.dealershipMemberships).values({
            dealershipId: membershipSeed.dealershipId,
            userId: account.id,
            role: membershipSeed.role,
          });
        } else if (
          membership.role !== membershipSeed.role ||
          !membership.isActive
        ) {
          await tx
            .update(schema.dealershipMemberships)
            .set({
              role: membershipSeed.role,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(schema.dealershipMemberships.id, membership.id));
        }
      }
    }
  });
}

void seedDatabase().catch(() => {
  console.error(
    "Database seed failed; check DATABASE_URL and run migrations first.",
  );
  process.exitCode = 1;
});
