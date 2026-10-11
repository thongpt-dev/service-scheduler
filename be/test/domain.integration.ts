import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AuthService } from "../src/auth/auth.service";
import * as schema from "../src/database/schema";
import { CustomersService } from "../src/customers/customers.service";
import { DealershipsService } from "../src/dealerships/dealerships.service";
import { ServiceCatalogService } from "../src/service-catalog/service-catalog.service";
import { VehiclesService } from "../src/vehicles/vehicles.service";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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
      JWT_ACCESS_TOKEN_TTL_SECONDS: "900",
    }),
  );
  const customersService = new CustomersService(db);
  const dealershipsService = new DealershipsService(db);
  const vehiclesService = new VehiclesService(db, customersService);
  const serviceCatalogService = new ServiceCatalogService(db);

  try {
    execFileSync("npm", ["run", "db:seed"], {
      cwd: resolve(__dirname, ".."),
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
    const customerToken = await authService.customerLogin({
      email: "sample.customer@example.test",
      password: "LocalCustomerPass123!",
    });
    const customerAuth = await authService.authenticateBearerToken(
      customerToken.accessToken,
    );
    const sampleCustomer = customerAuth.customer;
    assert(sampleCustomer !== null, "Seeded customer must have a profile");
    assert(
      (await vehiclesService.listMyVehicles(customerAuth)).some(
        (vehicle) => vehicle.id === "66666666-6666-4666-8666-666666666666",
      ),
      "Customer vehicle endpoint service must include the seeded owned vehicle",
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
