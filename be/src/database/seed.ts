import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "../auth/security.util";
import * as schema from "./schema";

const seedIds = {
  dealership: "11111111-1111-4111-8111-111111111111",
  serviceType: "22222222-2222-4222-8222-222222222222",
  technician: "33333333-3333-4333-8333-333333333333",
  bay: "44444444-4444-4444-8444-444444444444",
  customer: "55555555-5555-4555-8555-555555555555",
  vehicle: "66666666-6666-4666-8666-666666666666",
  customerUser: "99999999-9999-4999-8999-999999999999",
  unassignedVehicle: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner: "77777777-7777-4777-8777-777777777777",
  staff: "88888888-8888-4888-8888-888888888888",
};

const demoAccounts = [
  {
    id: seedIds.customerUser,
    email: "sample.customer@example.test",
    password: "LocalCustomerPass123!",
    dealershipRole: null,
  },
  {
    id: seedIds.owner,
    email: "sample.owner@example.test",
    password: "LocalOwnerPass123!",
    dealershipRole: "owner" as const,
  },
  {
    id: seedIds.staff,
    email: "sample.staff@example.test",
    password: "LocalStaffPass123!",
    dealershipRole: "staff" as const,
  },
];

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
      .values({
        id: seedIds.dealership,
        name: "Sample Service Center",
        addressLine1: "100 Example Way",
        city: "Springfield",
        region: "CA",
        postalCode: "90000",
        countryCode: "US",
        timezone: "America/Los_Angeles",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.serviceTypes)
      .values({
        id: seedIds.serviceType,
        name: "Standard Maintenance",
        description: "Fictional service used for local development.",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipServices)
      .values({
        dealershipId: seedIds.dealership,
        serviceTypeId: seedIds.serviceType,
        durationMinutes: 60,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipHours)
      .values([
        {
          dealershipId: seedIds.dealership,
          dayOfWeek: 0,
          openTime: null,
          closeTime: null,
          isClosed: true,
        },
        ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dealershipId: seedIds.dealership,
          dayOfWeek,
          openTime: "09:00",
          closeTime: "17:00",
          isClosed: false,
        })),
        {
          dealershipId: seedIds.dealership,
          dayOfWeek: 6,
          openTime: null,
          closeTime: null,
          isClosed: true,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.technicians)
      .values({
        id: seedIds.technician,
        dealershipId: seedIds.dealership,
        displayName: "Sample Technician",
        employeeCode: "TECH-001",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.technicianQualifications)
      .values({
        technicianId: seedIds.technician,
        serviceTypeId: seedIds.serviceType,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.technicianShifts)
      .values(
        [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          technicianId: seedIds.technician,
          dayOfWeek,
          startLocalTime: "09:00",
          endLocalTime: "17:00",
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(schema.serviceBays)
      .values({
        id: seedIds.bay,
        dealershipId: seedIds.dealership,
        bayCode: "BAY-01",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.bayServiceCapabilities)
      .values({
        bayId: seedIds.bay,
        serviceTypeId: seedIds.serviceType,
      })
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
      .insert(schema.dealershipCustomers)
      .values({
        dealershipId: seedIds.dealership,
        customerId: seedIds.customer,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipCustomers)
      .values({
        dealershipId: seedIds.dealership,
        customerId: seedIds.customer,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.vehicles)
      .values({
        id: seedIds.vehicle,
        ownerCustomerId: seedIds.customer,
        vin: "SAMPLE12345678901",
        make: "Example Motors",
        model: "Development Vehicle",
        year: 2022,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.dealershipVehicles)
      .values({
        dealershipId: seedIds.dealership,
        vehicleId: seedIds.vehicle,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.vehicles)
      .values({
        id: seedIds.unassignedVehicle,
        ownerCustomerId: seedIds.customer,
        vin: "SAMPLE12345678902",
        make: "Example Motors",
        model: "Unassigned Development Vehicle",
        year: 2023,
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
    const [dealership] = await tx
      .select({ id: schema.dealerships.id })
      .from(schema.dealerships)
      .where(
        and(
          eq(schema.dealerships.id, seedIds.dealership),
          eq(schema.dealerships.isActive, true),
        ),
      )
      .limit(1);
    if (!dealership) {
      throw new Error("Seed dealership does not exist");
    }

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

      if (!account.dealershipRole) {
        continue;
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
            eq(schema.dealershipMemberships.dealershipId, seedIds.dealership),
            eq(schema.dealershipMemberships.userId, account.id),
          ),
        )
        .limit(1);

      if (!membership) {
        await tx.insert(schema.dealershipMemberships).values({
          dealershipId: seedIds.dealership,
          userId: account.id,
          role: account.dealershipRole,
        });
      } else if (
        membership.role !== account.dealershipRole ||
        !membership.isActive
      ) {
        await tx
          .update(schema.dealershipMemberships)
          .set({
            role: account.dealershipRole,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.dealershipMemberships.id, membership.id));
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
