import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const seededIds = {
  dealership: "11111111-1111-4111-8111-111111111111",
  serviceType: "22222222-2222-4222-8222-222222222222",
  technician: "33333333-3333-4333-8333-333333333333",
  bay: "44444444-4444-4444-8444-444444444444",
  customer: "55555555-5555-4555-8555-555555555555",
  vehicle: "66666666-6666-4666-8666-666666666666",
  unassignedVehicle: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  customerUser: "99999999-9999-4999-8999-999999999999",
  owner: "77777777-7777-4777-8777-777777777777",
  staff: "88888888-8888-4888-8888-888888888888",
  manager: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
  mountainDealership: "11111111-1111-4111-8111-111111111112",
  cityDealership: "11111111-1111-4111-8111-111111111113",
  secondCustomer: "55555555-5555-4555-8555-555555555556",
  thirdCustomer: "55555555-5555-4555-8555-555555555557",
  mountainVehicle: "66666666-6666-4666-8666-666666666667",
  mountainSecondVehicle: "66666666-6666-4666-8666-666666666668",
  cityVehicle: "66666666-6666-4666-8666-666666666669",
  mountainTechnician: "33333333-3333-4333-8333-333333333334",
  diagnosticsTechnician: "33333333-3333-4333-8333-333333333335",
  cityTechnician: "33333333-3333-4333-8333-333333333336",
  mountainBay: "44444444-4444-4444-8444-444444444445",
  mountainDiagnosticsBay: "44444444-4444-4444-8444-444444444446",
  cityBay: "44444444-4444-4444-8444-444444444447",
};

function databaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectPostgresError(
  operation: () => Promise<unknown>,
  expectedCode: string,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(databaseErrorCode(error) === expectedCode, message);
    return;
  }

  throw new Error(message);
}

async function seed(pool: Pool, databaseUrl: string): Promise<void> {
  const workspaceRoot = resolve(__dirname, "..");
  execFileSync("npm", ["run", "db:seed"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    },
    stdio: "inherit",
  });

  const result = await pool.query<{
    dealership: string;
    hours: string;
    technician: string;
    bay: string;
    vehicle: string;
    customerUserLink: string;
    ownerMembership: string;
    staffMembership: string;
    demoDealerships: string;
    demoHours: string;
    demoCustomers: string;
    demoVehicles: string;
    demoVehicleAssignments: string;
    demoServices: string;
    demoTechnicians: string;
    demoQualifications: string;
    demoShifts: string;
    demoLeaves: string;
    demoBays: string;
    demoCapabilities: string;
    demoClosures: string;
    managerMembership: string;
  }>(
    `SELECT
      (SELECT count(*) FROM dealerships WHERE id = $1) AS dealership,
      (SELECT count(*) FROM dealership_hours WHERE dealership_id = $1) AS hours,
      (SELECT count(*) FROM technicians WHERE id = $2) AS technician,
      (SELECT count(*) FROM service_bays WHERE id = $3) AS bay,
      (SELECT count(*) FROM vehicles WHERE id = $4) AS vehicle,
      (SELECT count(*) FROM customers WHERE id = $8 AND user_id = $5) AS "customerUserLink",
      (SELECT count(*) FROM dealership_memberships WHERE dealership_id = $1 AND user_id = $6 AND role = 'owner' AND is_active) AS "ownerMembership",
      (SELECT count(*) FROM dealership_memberships WHERE dealership_id = $1 AND user_id = $7 AND role = 'staff' AND is_active) AS "staffMembership",
      (SELECT count(*) FROM dealerships WHERE id = ANY($9::uuid[])) AS "demoDealerships",
      (SELECT count(*) FROM dealership_hours WHERE dealership_id = ANY($9::uuid[])) AS "demoHours",
      (SELECT count(*) FROM customers WHERE id = ANY($10::uuid[])) AS "demoCustomers",
      (SELECT count(*) FROM vehicles WHERE id = ANY($11::uuid[])) AS "demoVehicles",
      (SELECT count(*) FROM dealership_vehicles WHERE dealership_id = ANY($9::uuid[]) AND vehicle_id = ANY($11::uuid[])) AS "demoVehicleAssignments",
      (SELECT count(*) FROM service_types WHERE id = ANY($12::uuid[])) AS "demoServices",
      (SELECT count(*) FROM technicians WHERE id = ANY($13::uuid[])) AS "demoTechnicians",
      (SELECT count(*) FROM technician_qualifications WHERE technician_id = ANY($13::uuid[])) AS "demoQualifications",
      (SELECT count(*) FROM technician_shifts WHERE technician_id = ANY($13::uuid[])) AS "demoShifts",
      (SELECT count(*) FROM technician_leaves WHERE technician_id = ANY($13::uuid[])) AS "demoLeaves",
      (SELECT count(*) FROM service_bays WHERE id = ANY($14::uuid[])) AS "demoBays",
      (SELECT count(*) FROM bay_service_capabilities WHERE bay_id = ANY($14::uuid[])) AS "demoCapabilities",
      (SELECT count(*) FROM dealership_closures WHERE id = ANY($15::uuid[])) AS "demoClosures",
      (SELECT count(*) FROM dealership_memberships WHERE dealership_id = $16 AND user_id = $17 AND role = 'manager' AND is_active) AS "managerMembership"`,
    [
      seededIds.dealership,
      seededIds.technician,
      seededIds.bay,
      seededIds.vehicle,
      seededIds.customerUser,
      seededIds.owner,
      seededIds.staff,
      seededIds.customer,
      [
        seededIds.dealership,
        seededIds.mountainDealership,
        seededIds.cityDealership,
      ],
      [seededIds.customer, seededIds.secondCustomer, seededIds.thirdCustomer],
      [
        seededIds.vehicle,
        seededIds.unassignedVehicle,
        seededIds.mountainVehicle,
        seededIds.mountainSecondVehicle,
        seededIds.cityVehicle,
      ],
      [
        seededIds.serviceType,
        "22222222-2222-4222-8222-222222222223",
        "22222222-2222-4222-8222-222222222224",
        "22222222-2222-4222-8222-222222222225",
      ],
      [
        seededIds.technician,
        seededIds.mountainTechnician,
        seededIds.diagnosticsTechnician,
        seededIds.cityTechnician,
      ],
      [
        seededIds.bay,
        seededIds.mountainBay,
        seededIds.mountainDiagnosticsBay,
        seededIds.cityBay,
      ],
      [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      ],
      seededIds.mountainDealership,
      seededIds.manager,
    ],
  );
  const counts = result.rows[0];
  assert(
    counts.dealership === "1" &&
      counts.hours === "7" &&
      counts.technician === "1" &&
      counts.bay === "1" &&
      counts.vehicle === "1" &&
      counts.customerUserLink === "1" &&
      counts.ownerMembership === "1" &&
      counts.staffMembership === "1" &&
      counts.demoDealerships === "3" &&
      counts.demoHours === "21" &&
      counts.demoCustomers === "3" &&
      counts.demoVehicles === "5" &&
      counts.demoVehicleAssignments === "4" &&
      counts.demoServices === "4" &&
      counts.demoTechnicians === "4" &&
      counts.demoQualifications === "7" &&
      counts.demoShifts === "20" &&
      counts.demoLeaves === "2" &&
      counts.demoBays === "4" &&
      counts.demoCapabilities === "7" &&
      counts.demoClosures === "2" &&
      counts.managerMembership === "1",
    "Seed should create repeatable fixtures with linked customer, owner, and staff accounts",
  );
}

async function run(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL to run PostgreSQL integration checks",
    );
  }

  const testDatabaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (testDatabaseName !== "service_scheduler_test") {
    throw new Error(
      "Refusing to reset a database other than service_scheduler_test",
    );
  }

  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: "./drizzle",
    });

    const tableResult = await pool.query<{ count: string }>(
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
    );
    assert(tableResult.rows[0].count === "20", "Expected 20 MVP tables");

    await seed(pool, testDatabaseUrl);
    await seed(pool, testDatabaseUrl);

    const testUserId = randomUUID();
    const testSuffix = randomUUID().slice(0, 8);
    await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [testUserId, `schema-test-${testSuffix}@example.test`, "test-only-hash"],
    );

    const secondTechnicianId = randomUUID();
    const secondBayId = randomUUID();
    const unqualifiedTechnicianId = randomUUID();
    const unsupportedBayId = randomUUID();
    await pool.query(
      "INSERT INTO technicians (id, dealership_id, display_name, employee_code) VALUES ($1, $2, $3, $4)",
      [
        secondTechnicianId,
        seededIds.dealership,
        "Schema Test Technician",
        `SCHEMA-${testSuffix}`,
      ],
    );
    await pool.query(
      "INSERT INTO technician_qualifications (technician_id, service_type_id) VALUES ($1, $2)",
      [secondTechnicianId, seededIds.serviceType],
    );
    await pool.query(
      "INSERT INTO service_bays (id, dealership_id, bay_code) VALUES ($1, $2, $3)",
      [secondBayId, seededIds.dealership, `SCHEMA-${testSuffix}`],
    );
    await pool.query(
      "INSERT INTO bay_service_capabilities (bay_id, service_type_id) VALUES ($1, $2)",
      [secondBayId, seededIds.serviceType],
    );
    await pool.query(
      "INSERT INTO technicians (id, dealership_id, display_name, employee_code) VALUES ($1, $2, $3, $4)",
      [
        unqualifiedTechnicianId,
        seededIds.dealership,
        "Unqualified Schema Test Technician",
        `UNQUALIFIED-${testSuffix}`,
      ],
    );
    await pool.query(
      "INSERT INTO service_bays (id, dealership_id, bay_code) VALUES ($1, $2, $3)",
      [unsupportedBayId, seededIds.dealership, `UNSUPPORTED-${testSuffix}`],
    );

    const startsAt = new Date("2030-01-07T18:00:00.000Z");
    const endsAt = new Date("2030-01-07T19:00:00.000Z");
    const insertAppointment = async (
      reference: string,
      status: "confirmed" | "cancelled" | "completed" | "no_show",
      technicianId: string,
      bayId: string,
      appointmentStartsAt = startsAt,
      appointmentEndsAt = endsAt,
    ): Promise<string> => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO appointments (
          appointment_ref, customer_id, vehicle_id, dealership_id,
          service_type_id, assigned_technician_id, assigned_bay_id,
          created_by_user_id, booking_channel, status, starts_at, ends_at,
          service_name_snapshot, duration_minutes_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          reference,
          seededIds.customer,
          seededIds.vehicle,
          seededIds.dealership,
          seededIds.serviceType,
          technicianId,
          bayId,
          testUserId,
          "customer_self_service",
          status,
          appointmentStartsAt,
          appointmentEndsAt,
          "Standard Maintenance",
          60,
        ],
      );
      return result.rows[0].id;
    };

    const firstAppointmentId = await insertAppointment(
      `SCHEMA-${testSuffix}-1`,
      "confirmed",
      seededIds.technician,
      seededIds.bay,
    );

    const overlappingAssignments: Array<[string, string]> = [
      [seededIds.technician, secondBayId],
      [secondTechnicianId, seededIds.bay],
    ];
    for (const [technicianId, bayId] of overlappingAssignments) {
      await expectPostgresError(
        () =>
          insertAppointment(
            `SCHEMA-${testSuffix}-${randomUUID().slice(0, 4)}`,
            "confirmed",
            technicianId,
            bayId,
          ),
        "23P01",
        "Overlapping confirmed appointment should violate a capacity exclusion constraint",
      );
    }

    await insertAppointment(
      `SCHEMA-${testSuffix}-adjacent`,
      "confirmed",
      seededIds.technician,
      seededIds.bay,
      endsAt,
      new Date("2030-01-07T20:00:00.000Z"),
    );
    const nonReservingStatuses = ["cancelled", "completed", "no_show"] as const;
    for (const status of nonReservingStatuses) {
      await insertAppointment(
        `SCHEMA-${testSuffix}-${status}`,
        status,
        seededIds.technician,
        seededIds.bay,
      );
    }

    await expectPostgresError(
      () =>
        insertAppointment(
          `SCHEMA-${testSuffix}-unqualified`,
          "confirmed",
          unqualifiedTechnicianId,
          secondBayId,
        ),
      "23503",
      "Appointment must reference a technician qualified for the service",
    );
    await expectPostgresError(
      () =>
        insertAppointment(
          `SCHEMA-${testSuffix}-unsupported-bay`,
          "confirmed",
          secondTechnicianId,
          unsupportedBayId,
        ),
      "23503",
      "Appointment must reference a bay capable of the service",
    );

    const requestHash = createHash("sha256")
      .update(`request-${testSuffix}`)
      .digest("hex");
    await pool.query(
      `INSERT INTO idempotency_records
        (actor_user_id, operation, idempotency_key, request_hash, appointment_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        testUserId,
        "appointment:create",
        `schema-test-${testSuffix}`,
        requestHash,
        firstAppointmentId,
      ],
    );
    const idempotencyResult = await pool.query<{ within_ttl: boolean }>(
      `SELECT expires_at <= created_at + interval '24 hours' AS within_ttl
       FROM idempotency_records
       WHERE actor_user_id = $1 AND operation = $2 AND idempotency_key = $3`,
      [testUserId, "appointment:create", `schema-test-${testSuffix}`],
    );
    assert(
      idempotencyResult.rows[0].within_ttl === true,
      "Idempotency records must expire within 24 hours",
    );
    await expectPostgresError(
      () =>
        pool.query(
          `INSERT INTO idempotency_records
            (actor_user_id, operation, idempotency_key, request_hash, appointment_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            testUserId,
            "appointment:create",
            `schema-test-${testSuffix}`,
            createHash("sha256").update("different-request").digest("hex"),
            firstAppointmentId,
          ],
        ),
      "23505",
      "Actor, operation, and idempotency key must be unique",
    );

    console.log(
      "Database integration checks passed: migrations, repeatable seed, compatibility FKs, capacity exclusions, and 24-hour idempotency TTL.",
    );
  } finally {
    await pool.end();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
