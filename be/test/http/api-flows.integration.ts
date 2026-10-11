import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AppModule as AppModuleDefinition } from "../../src/app.module";

const seeded = {
  dealershipId: "11111111-1111-4111-8111-111111111111",
  mountainDealershipId: "11111111-1111-4111-8111-111111111112",
  serviceTypeId: "22222222-2222-4222-8222-222222222222",
  vehicleId: "66666666-6666-4666-8666-666666666666",
  mountainVehicleId: "66666666-6666-4666-8666-666666666667",
  customerId: "55555555-5555-4555-8555-555555555555",
  mountainCustomerId: "55555555-5555-4555-8555-555555555556",
};

interface HttpResult {
  status: number;
  body: unknown;
}

interface CleanupAppointment {
  id: string;
  accessToken: string;
}

interface BookingRequest {
  dealershipId: string;
  vehicleId: string;
  serviceTypeId: string;
  startsAt: string;
}

interface AvailabilityRequest {
  dealershipId: string;
  vehicleId: string;
  serviceTypeId: string;
  timezone: string;
  customerId?: string;
}

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  durationMinutesSnapshot: number;
}

interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

let currentStep = 0;

function logStep(description: string): void {
  currentStep += 1;
  console.log(`\n[api-flow step ${currentStep}] ${description}`);
}

function sanitizeForLog(value: unknown, key = ""): unknown {
  if (
    key &&
    /(password|email|token|secret|authorization|customer.?id|vehicle.?id|user.?id|vin|phone|first.?name|last.?name)/i.test(
      key,
    )
  ) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLog(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeForLog(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function sanitizePath(path: string): string {
  return path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "<uuid>",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  assert.ok(isRecord(value), `${label} must be a JSON object`);
}

function readString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`${label}.${key} must be a string`);
  }
  return field;
}

function readAppointment(value: unknown, label: string): Appointment {
  assertRecord(value, label);
  const duration = value.durationMinutesSnapshot;
  if (typeof duration !== "number") {
    throw new Error(`${label}.durationMinutesSnapshot must be a number`);
  }
  return {
    id: readString(value, "id", label),
    startsAt: readString(value, "startsAt", label),
    endsAt: readString(value, "endsAt", label),
    status: readString(value, "status", label),
    durationMinutesSnapshot: duration,
  };
}

function readToken(value: unknown, label: string): string {
  assertRecord(value, label);
  return readString(value, "accessToken", label);
}

function errorSummary(body: unknown): string {
  return JSON.stringify(sanitizeForLog(body));
}

async function request(
  baseUrl: string,
  method: string,
  path: string,
  options: {
    accessToken?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<HttpResult> {
  const headers = new Headers();
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  const logHeaders: Record<string, string> = {};
  if (options.accessToken) {
    logHeaders.Authorization = "[REDACTED]";
  }
  if (options.body !== undefined) {
    logHeaders["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    logHeaders["Idempotency-Key"] = "[REDACTED]";
  }
  const safePath = sanitizePath(path);
  console.log(
    JSON.stringify({
      type: "http-request",
      method,
      path: safePath,
      headers: logHeaders,
      payload: sanitizeForLog(options.body ?? null),
    }),
  );
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const responseText = await response.text();
  let body: unknown;
  if (responseText.length > 0) {
    try {
      body = JSON.parse(responseText) as unknown;
    } catch {
      body = responseText;
    }
  }
  console.log(
    JSON.stringify({
      type: "http-response",
      method,
      path: safePath,
      status: response.status,
      body: sanitizeForLog(body ?? null),
    }),
  );
  return { status: response.status, body };
}

function expectStatus(
  result: HttpResult,
  expected: number,
  label: string,
): void {
  assert.equal(
    result.status,
    expected,
    `${label}: expected HTTP ${expected}, received ${result.status}: ${errorSummary(result.body)}`,
  );
}

function localDateAfter(timezone: string, dayOffset: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string): number => {
    const value = parts.find((entry) => entry.type === type)?.value;
    assert.ok(value, `Missing ${type} in localized date`);
    return Number(value);
  };
  const date = new Date(
    Date.UTC(part("year"), part("month") - 1, part("day") + dayOffset),
  );
  return date.toISOString().slice(0, 10);
}

function readSlots(value: unknown): AvailabilitySlot[] {
  assertRecord(value, "availability response");
  const slots = value.slots;
  assert.ok(Array.isArray(slots), "availability.slots must be an array");
  return slots.map((slot, index) => {
    assertRecord(slot, `availability.slots[${index}]`);
    return {
      startsAt: readString(slot, "startsAt", `availability.slots[${index}]`),
      endsAt: readString(slot, "endsAt", `availability.slots[${index}]`),
    };
  });
}

async function findAvailableSlot(
  baseUrl: string,
  accessToken: string,
  search: AvailabilityRequest,
  unavailableStarts: Set<string> = new Set(),
): Promise<AvailabilitySlot> {
  for (let dayOffset = 1; dayOffset <= 55; dayOffset += 1) {
    const query = new URLSearchParams({
      dealershipId: search.dealershipId,
      vehicleId: search.vehicleId,
      serviceTypeId: search.serviceTypeId,
      date: localDateAfter(search.timezone, dayOffset),
    });
    if (search.customerId) {
      query.set("customerId", search.customerId);
    }
    const result = await request(
      baseUrl,
      "GET",
      `/api/v1/availability?${query.toString()}`,
      { accessToken },
    );
    expectStatus(result, 200, "Availability request");
    const slot = readSlots(result.body).find(
      (candidate) => !unavailableStarts.has(candidate.startsAt),
    );
    if (slot) {
      return slot;
    }
  }
  throw new Error(
    `No available slot found within the booking horizon for dealership ${search.dealershipId}`,
  );
}

async function login(
  baseUrl: string,
  path: string,
  email: string,
  password: string,
): Promise<string> {
  const result = await request(baseUrl, "POST", path, {
    body: { email, password },
  });
  expectStatus(result, 200, `${path} login`);
  return readToken(result.body, `${path} response`);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(
    databaseUrl &&
      new URL(databaseUrl).pathname.slice(1) === "service_scheduler_test",
    "Set TEST_DATABASE_URL to service_scheduler_test; refusing any other database",
  );

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.JWT_ISSUER = "service-scheduler-http-integration";
  process.env.JWT_AUDIENCE = "service-scheduler-http-test-clients";

  const workspaceRoot = resolve(__dirname, "../..");
  logStep("Seed repeatable local demo accounts without resetting the database");
  execFileSync("npm", ["run", "db:seed"], {
    cwd: workspaceRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" },
    stdio: "inherit",
  });

  const { AppModule } = createRequire(__filename)("../../src/app.module") as {
    AppModule: typeof AppModuleDefinition;
  };
  const app: INestApplication = await NestFactory.create(AppModule, {
    logger: false,
  });
  const createdAppointments: CleanupAppointment[] = [];
  let baseUrl: string | undefined;

  try {
    logStep("Start the real Nest application on an ephemeral loopback port");
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();

    logStep("Check readiness and log in as seeded customer and staff");
    const ready = await request(baseUrl, "GET", "/api/v1/ready");
    expectStatus(ready, 200, "Readiness endpoint");

    const customerToken = await login(
      baseUrl,
      "/api/v1/auth/customers/login",
      "sample.customer@example.test",
      "LocalCustomerPass123!",
    );
    const staffToken = await login(
      baseUrl,
      "/api/v1/auth/staff/login",
      "sample.staff@example.test",
      "LocalStaffPass123!",
    );

    logStep("Verify appointment history rejects unauthenticated callers");
    const unauthorizedList = await request(
      baseUrl,
      "GET",
      "/api/v1/appointments/me",
    );
    expectStatus(
      unauthorizedList,
      401,
      "Unauthenticated customer appointment list",
    );

    logStep("Find a customer slot, book it, and verify idempotency behavior");
    const customerSearch: AvailabilityRequest = {
      dealershipId: seeded.dealershipId,
      vehicleId: seeded.vehicleId,
      serviceTypeId: seeded.serviceTypeId,
      timezone: "America/Los_Angeles",
    };
    const customerSlot = await findAvailableSlot(
      baseUrl,
      customerToken,
      customerSearch,
    );
    const selfServiceRequest: BookingRequest = {
      dealershipId: customerSearch.dealershipId,
      vehicleId: customerSearch.vehicleId,
      serviceTypeId: customerSearch.serviceTypeId,
      startsAt: customerSlot.startsAt,
    };
    const selfServiceKey = randomUUID();
    const selfServiceResult = await request(
      baseUrl,
      "POST",
      "/api/v1/appointments/self-service",
      {
        accessToken: customerToken,
        idempotencyKey: selfServiceKey,
        body: selfServiceRequest,
      },
    );
    expectStatus(selfServiceResult, 201, "Customer self-service booking");
    const selfServiceAppointment = readAppointment(
      selfServiceResult.body,
      "self-service appointment",
    );
    createdAppointments.push({
      id: selfServiceAppointment.id,
      accessToken: customerToken,
    });

    const replayResult = await request(
      baseUrl,
      "POST",
      "/api/v1/appointments/self-service",
      {
        accessToken: customerToken,
        idempotencyKey: selfServiceKey,
        body: selfServiceRequest,
      },
    );
    expectStatus(replayResult, 201, "Matching idempotent booking replay");
    assert.equal(
      readAppointment(replayResult.body, "replayed appointment").id,
      selfServiceAppointment.id,
      "A matching retry must return the same appointment",
    );
    const mismatchedReplay = await request(
      baseUrl,
      "POST",
      "/api/v1/appointments/self-service",
      {
        accessToken: customerToken,
        idempotencyKey: selfServiceKey,
        body: {
          ...selfServiceRequest,
          startsAt: new Date(
            new Date(selfServiceRequest.startsAt).getTime() + 15 * 60_000,
          ).toISOString(),
        },
      },
    );
    expectStatus(mismatchedReplay, 409, "Idempotency key request mismatch");

    logStep(
      "Read the booking as the customer and search it in the staff schedule",
    );
    const customerList = await request(
      baseUrl,
      "GET",
      "/api/v1/appointments/me?period=upcoming&limit=100",
      { accessToken: customerToken },
    );
    expectStatus(customerList, 200, "Customer appointment list");
    assertRecord(customerList.body, "customer appointment list");
    assert.ok(
      Array.isArray(customerList.body.items),
      "Customer list must include items",
    );
    assert.ok(
      customerList.body.items.some(
        (item: unknown) =>
          isRecord(item) && item.id === selfServiceAppointment.id,
      ),
      "Customer list must include the new appointment",
    );
    const customerDetail = await request(
      baseUrl,
      "GET",
      `/api/v1/appointments/me/${selfServiceAppointment.id}`,
      { accessToken: customerToken },
    );
    expectStatus(customerDetail, 200, "Customer appointment detail");

    const appointmentFrom = new Date(
      new Date(selfServiceAppointment.startsAt).getTime() - 60_000,
    ).toISOString();
    const appointmentTo = new Date(
      new Date(selfServiceAppointment.endsAt).getTime() + 60_000,
    ).toISOString();
    const scheduleQuery = new URLSearchParams({
      from: appointmentFrom,
      to: appointmentTo,
    });
    const schedulePath = `/api/v1/dealerships/${seeded.dealershipId}/appointments?${scheduleQuery.toString()}`;
    const staffSchedule = await request(baseUrl, "GET", schedulePath, {
      accessToken: staffToken,
    });
    expectStatus(staffSchedule, 200, "Dealership schedule query");
    assertRecord(staffSchedule.body, "dealership schedule");
    assert.ok(
      Array.isArray(staffSchedule.body.items),
      "Schedule response must include items",
    );
    assert.ok(
      staffSchedule.body.items.some(
        (item: unknown) =>
          isRecord(item) && item.id === selfServiceAppointment.id,
      ),
      "Dealership schedule must include the new appointment",
    );
    const staffDetail = await request(
      baseUrl,
      "GET",
      `/api/v1/dealerships/${seeded.dealershipId}/appointments/${selfServiceAppointment.id}`,
      { accessToken: staffToken },
    );
    expectStatus(staffDetail, 200, "Dealership appointment detail");

    logStep(
      "Race two booking requests for one slot; require exactly one winner",
    );
    const competingSlot = await findAvailableSlot(
      baseUrl,
      customerToken,
      customerSearch,
      new Set([customerSlot.startsAt]),
    );
    const competingRequest = {
      ...selfServiceRequest,
      startsAt: competingSlot.startsAt,
    };
    const competingResults = await Promise.all([
      request(baseUrl, "POST", "/api/v1/appointments/self-service", {
        accessToken: customerToken,
        idempotencyKey: randomUUID(),
        body: competingRequest,
      }),
      request(baseUrl, "POST", "/api/v1/appointments/self-service", {
        accessToken: customerToken,
        idempotencyKey: randomUUID(),
        body: competingRequest,
      }),
    ]);
    const competingStatuses = competingResults
      .map(({ status }) => status)
      .sort();
    assert.deepEqual(
      competingStatuses,
      [201, 409],
      "Exactly one concurrent request should confirm a shared resource interval",
    );
    const competingSuccess = competingResults.find(
      ({ status }) => status === 201,
    );
    assert.ok(competingSuccess, "One competing request should succeed");
    const competingAppointment = readAppointment(
      competingSuccess.body,
      "competing appointment",
    );
    createdAppointments.push({
      id: competingAppointment.id,
      accessToken: customerToken,
    });

    logStep(
      "Reschedule, reject an occupied replacement, and check status guards",
    );
    const rescheduleSlot = await findAvailableSlot(
      baseUrl,
      customerToken,
      customerSearch,
      new Set([customerSlot.startsAt, competingSlot.startsAt]),
    );
    const rescheduleResult = await request(
      baseUrl,
      "POST",
      `/api/v1/appointments/${selfServiceAppointment.id}/reschedule`,
      {
        accessToken: customerToken,
        body: { startsAt: rescheduleSlot.startsAt },
      },
    );
    expectStatus(rescheduleResult, 200, "Customer reschedule");
    const rescheduledAppointment = readAppointment(
      rescheduleResult.body,
      "rescheduled appointment",
    );
    assert.equal(rescheduledAppointment.startsAt, rescheduleSlot.startsAt);
    assert.equal(
      rescheduledAppointment.durationMinutesSnapshot,
      selfServiceAppointment.durationMinutesSnapshot,
      "Rescheduling must preserve the booked duration snapshot",
    );
    const failedReschedule = await request(
      baseUrl,
      "POST",
      `/api/v1/appointments/${selfServiceAppointment.id}/reschedule`,
      {
        accessToken: customerToken,
        body: { startsAt: competingSlot.startsAt },
      },
    );
    expectStatus(failedReschedule, 409, "Reschedule into an occupied interval");
    const appointmentAfterFailedReschedule = await request(
      baseUrl,
      "GET",
      `/api/v1/appointments/me/${selfServiceAppointment.id}`,
      { accessToken: customerToken },
    );
    expectStatus(
      appointmentAfterFailedReschedule,
      200,
      "Appointment after failed reschedule",
    );
    assert.equal(
      readAppointment(
        appointmentAfterFailedReschedule.body,
        "appointment after failed reschedule",
      ).startsAt,
      rescheduledAppointment.startsAt,
      "Failed rescheduling must leave the appointment unchanged",
    );

    const futureCompletion = await request(
      baseUrl,
      "PATCH",
      `/api/v1/appointments/${selfServiceAppointment.id}/status`,
      { accessToken: staffToken, body: { status: "completed" } },
    );
    expectStatus(futureCompletion, 409, "Completion before scheduled end");
    const futureNoShow = await request(
      baseUrl,
      "PATCH",
      `/api/v1/appointments/${selfServiceAppointment.id}/status`,
      { accessToken: staffToken, body: { status: "no_show" } },
    );
    expectStatus(futureNoShow, 409, "No-show before scheduled start");

    logStep("Cancel the customer's appointment and release its capacity");
    const cancellation = await request(
      baseUrl,
      "POST",
      `/api/v1/appointments/${selfServiceAppointment.id}/cancel`,
      { accessToken: customerToken },
    );
    expectStatus(cancellation, 200, "Customer cancellation");
    assert.equal(
      readAppointment(cancellation.body, "cancelled appointment").status,
      "cancelled",
    );
    createdAppointments.splice(
      createdAppointments.findIndex(
        ({ id }) => id === selfServiceAppointment.id,
      ),
      1,
    );

    logStep(
      "Create and cancel a staff-assisted booking at the Mountain dealership",
    );
    const mountainSearch: AvailabilityRequest = {
      dealershipId: seeded.mountainDealershipId,
      vehicleId: seeded.mountainVehicleId,
      serviceTypeId: seeded.serviceTypeId,
      customerId: seeded.mountainCustomerId,
      timezone: "America/Denver",
    };
    const mountainSlot = await findAvailableSlot(
      baseUrl,
      staffToken,
      mountainSearch,
    );
    const staffAssistedResult = await request(
      baseUrl,
      "POST",
      "/api/v1/appointments/staff-assisted",
      {
        accessToken: staffToken,
        idempotencyKey: randomUUID(),
        body: {
          dealershipId: mountainSearch.dealershipId,
          customerId: mountainSearch.customerId,
          vehicleId: mountainSearch.vehicleId,
          serviceTypeId: mountainSearch.serviceTypeId,
          startsAt: mountainSlot.startsAt,
        },
      },
    );
    expectStatus(staffAssistedResult, 201, "Staff-assisted booking");
    const staffAssistedAppointment = readAppointment(
      staffAssistedResult.body,
      "staff-assisted appointment",
    );
    createdAppointments.push({
      id: staffAssistedAppointment.id,
      accessToken: staffToken,
    });
    const staffAssistedCancellation = await request(
      baseUrl,
      "POST",
      `/api/v1/appointments/${staffAssistedAppointment.id}/cancel`,
      { accessToken: staffToken },
    );
    expectStatus(staffAssistedCancellation, 200, "Staff cancellation");
    createdAppointments.splice(
      createdAppointments.findIndex(
        ({ id }) => id === staffAssistedAppointment.id,
      ),
      1,
    );

  } finally {
    if (baseUrl) {
      for (const appointment of createdAppointments) {
        try {
          await request(
            baseUrl,
            "POST",
            `/api/v1/appointments/${appointment.id}/cancel`,
            { accessToken: appointment.accessToken },
          );
        } catch {
          // Cleanup is best-effort if the server is already stopping.
        }
      }
    }
    await app.close();
  }

  console.log(
    "HTTP API flow checks passed: login, availability, self/staff booking, idempotency, customer/staff reads, concurrency, reschedule rollback, cancellation, and status guards.",
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
