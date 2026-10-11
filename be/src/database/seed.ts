import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const seedIds = {
  dealership: "11111111-1111-4111-8111-111111111111",
  serviceType: "22222222-2222-4222-8222-222222222222",
  technician: "33333333-3333-4333-8333-333333333333",
  bay: "44444444-4444-4444-8444-444444444444",
  customer: "55555555-5555-4555-8555-555555555555",
  vehicle: "66666666-6666-4666-8666-666666666666",
};

async function seedDatabase(): Promise<void> {
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

    await db
      .insert(schema.customers)
      .values({
        id: seedIds.customer,
        email: "sample.customer@example.test",
        firstName: "Sample",
        lastName: "Customer",
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
  } finally {
    await pool.end();
  }
}

void seedDatabase().catch(() => {
  console.error(
    "Database seed failed; check DATABASE_URL and run migrations first.",
  );
  process.exitCode = 1;
});
