import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/database/schema";
import { AuthService } from "../src/auth/auth.service";
import { verifyPassword } from "../src/auth/security.util";

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
  const jwtSecret = randomBytes(48).toString("base64url");
  const authService = new AuthService(
    db,
    new ConfigService({
      JWT_SECRET: jwtSecret,
      JWT_ISSUER: "service-scheduler-auth-integration",
      JWT_AUDIENCE: "service-scheduler-test-clients",
    }),
  );

  try {
    const workspaceRoot = resolve(__dirname, "..");
    const ownerEmail = "sample.owner@example.test";
    const ownerPassword = "LocalOwnerPass123!";
    const staffEmail = "sample.staff@example.test";
    const staffPassword = "LocalStaffPass123!";
    const sampleCustomerEmail = "sample.customer@example.test";
    const sampleCustomerPassword = "LocalCustomerPass123!";
    const seedDemoAccounts = () =>
      execFileSync("npm", ["run", "db:seed"], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test",
        },
        stdio: "inherit",
      });

    seedDemoAccounts();
    seedDemoAccounts();

    const [ownerUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail));
    assert(
      ownerUser !== undefined,
      "Seed should create the local demo owner account",
    );
    assert(
      ownerUser.emailVerifiedAt === null,
      "Seeded owner starts unverified",
    );
    assert(
      await verifyPassword(ownerPassword, ownerUser.passwordHash),
      "Seeded owner password must be stored as a password hash",
    );

    const [staffUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, staffEmail));
    assert(
      staffUser !== undefined,
      "Seed should create the local demo staff account",
    );
    assert(
      staffUser.emailVerifiedAt === null,
      "Seeded staff starts unverified",
    );
    assert(
      await verifyPassword(staffPassword, staffUser.passwordHash),
      "Seeded staff password must be stored as a password hash",
    );

    const ownerLogin = await authService.staffLogin({
      email: ownerEmail,
      password: ownerPassword,
    });
    const ownerAuth = await authService.authenticateBearerToken(
      ownerLogin.accessToken,
    );
    assert(
      ownerAuth.principalRoles.includes("owner"),
      "Owner role is loaded from membership",
    );

    const staffLogin = await authService.staffLogin({
      email: staffEmail,
      password: staffPassword,
    });
    const staffAuth = await authService.authenticateBearerToken(
      staffLogin.accessToken,
    );
    assert(
      staffAuth.principalRoles.includes("staff") &&
        !staffAuth.principalRoles.includes("owner"),
      "Seeded staff account is linked with its dealership staff role",
    );

    const [sampleCustomer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.email, sampleCustomerEmail));
    assert(
      sampleCustomer !== undefined,
      "Seed should create the sample customer profile",
    );
    assert(
      sampleCustomer.userId !== null,
      "Sample customer profile must link to a login user",
    );

    const seededCustomerLogin = await authService.customerLogin({
      email: sampleCustomerEmail,
      password: sampleCustomerPassword,
    });
    const seededCustomerAuth = await authService.authenticateBearerToken(
      seededCustomerLogin.accessToken,
    );
    assert(
      seededCustomerAuth.customer?.id === sampleCustomer.id &&
        seededCustomerAuth.customer.emailVerifiedAt === null,
      "Seeded customer can sign in while remaining unverified",
    );

    const invalidTokens = [
      jwt.sign(
        { ver: ownerUser.tokenVersion },
        "wrong-test-secret-that-is-long-enough-for-hmac-validation",
        {
          algorithm: "HS256",
          audience: "service-scheduler-test-clients",
          expiresIn: 300,
          issuer: "service-scheduler-auth-integration",
          jwtid: randomUUID(),
          subject: ownerUser.id,
        },
      ),
      jwt.sign({ ver: ownerUser.tokenVersion }, jwtSecret, {
        algorithm: "HS256",
        audience: "wrong-audience",
        expiresIn: 300,
        issuer: "service-scheduler-auth-integration",
        jwtid: randomUUID(),
        subject: ownerUser.id,
      }),
      jwt.sign({ ver: ownerUser.tokenVersion }, jwtSecret, {
        algorithm: "HS256",
        audience: "service-scheduler-test-clients",
        expiresIn: 300,
        issuer: "wrong-issuer",
        jwtid: randomUUID(),
        subject: ownerUser.id,
      }),
      jwt.sign({ ver: ownerUser.tokenVersion }, jwtSecret, {
        algorithm: "HS256",
        audience: "service-scheduler-test-clients",
        expiresIn: -1,
        issuer: "service-scheduler-auth-integration",
        jwtid: randomUUID(),
        subject: ownerUser.id,
      }),
    ];
    for (const invalidToken of invalidTokens) {
      await expectError(
        () => authService.authenticateBearerToken(invalidToken),
        UnauthorizedException,
        "JWT signature, issuer, audience, and expiry must be validated",
      );
    }

    const customerEmail = `customer-${randomUUID()}@example.test`;
    const customerPassword = "Customer-Password-123!";
    const registration = await authService.registerCustomer({
      email: customerEmail,
      password: customerPassword,
      firstName: "Test",
      lastName: "Customer",
    });
    const customerAuth = await authService.authenticateBearerToken(
      registration.accessToken,
    );
    assert(registration.emailVerified === false, "Customer starts unverified");
    assert(
      registration.expiresIn === 1800,
      "Default customer access token lifetime must be 1800 seconds",
    );
    assert(
      customerAuth.customer?.emailVerifiedAt === null,
      "Unverified customer may authenticate and receives a customer principal",
    );
    assert(
      customerAuth.principalRoles.includes("customer"),
      "Customer principal role is derived from the active profile",
    );

    const existingProfileEmail = `existing-profile-${randomUUID()}@example.test`;
    const [existingProfile] = await db
      .insert(schema.customers)
      .values({
        email: existingProfileEmail,
        firstName: "Existing",
        lastName: "Dealership Customer",
        phone: "+12025550123",
      })
      .returning();
    assert(existingProfile !== undefined, "Unlinked profile should be created");

    const claimedRegistration = await authService.registerCustomer({
      email: existingProfileEmail.toUpperCase(),
      password: "Claimed-Profile-Password-123!",
      firstName: "Registration",
      lastName: "Details",
      phone: "+12025550987",
    });
    assert(
      claimedRegistration.customerId === existingProfile.id,
      "Registration with an existing unlinked profile must reuse its customer ID",
    );
    const [claimedProfile] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, existingProfile.id));
    assert(
      claimedProfile?.userId !== null &&
        claimedProfile?.userId !== undefined &&
        claimedProfile.firstName === "Existing" &&
        claimedProfile.lastName === "Dealership Customer" &&
        claimedProfile.phone === "+12025550123",
      "Registration must link the existing profile without overwriting its details",
    );
    const claimedAuth = await authService.authenticateBearerToken(
      claimedRegistration.accessToken,
    );
    assert(
      claimedAuth.customer?.id === existingProfile.id,
      "Claimed profile must be the customer principal for the new account",
    );

    await expectError(
      () =>
        authService.customerLogin({
          email: customerEmail,
          password: "wrong-password",
        }),
      UnauthorizedException,
      "Incorrect customer credentials must be rejected",
    );
    await expectError(
      () =>
        authService.registerCustomer({
          email: customerEmail,
          password: customerPassword,
          firstName: "Duplicate",
          lastName: "Customer",
        }),
      ConflictException,
      "Duplicate customer registration must be rejected",
    );
    const customerLogin = await authService.customerLogin({
      email: customerEmail,
      password: customerPassword,
    });
    assert(
      (await authService.authenticateBearerToken(customerLogin.accessToken))
        .customer !== null,
      "Unverified customers can sign in during the MVP",
    );

    const managerEmail = `manager-${randomUUID()}@example.test`;
    const managerProvision = await authService.provisionStaff(ownerAuth, {
      dealershipId: "11111111-1111-4111-8111-111111111111",
      email: managerEmail,
      password: "Manager-Password-123!",
      role: "manager",
    });
    const managerLogin = await authService.staffLogin({
      email: managerEmail,
      password: "Manager-Password-123!",
    });
    const managerAuth = await authService.authenticateBearerToken(
      managerLogin.accessToken,
    );
    assert(
      managerAuth.userId === managerProvision.staffUserId &&
        managerAuth.principalRoles.includes("manager"),
      "Provisioned manager can authenticate with dealership-scoped role",
    );
    await expectError(
      () =>
        authService.provisionStaff(managerAuth, {
          dealershipId: "11111111-1111-4111-8111-111111111111",
          email: `elevated-${randomUUID()}@example.test`,
          password: "Elevated-Password-123!",
          role: "manager",
        }),
      ForbiddenException,
      "Managers must not grant manager or owner roles",
    );
    await expectError(
      () =>
        authService.provisionStaff(managerAuth, {
          dealershipId: randomUUID(),
          email: `outside-${randomUUID()}@example.test`,
          password: "Outside-Password-123!",
          role: "staff",
        }),
      ForbiddenException,
      "Provisioning outside the actor's dealership must be rejected",
    );

    await authService.revokeAllTokens(ownerAuth);
    await expectError(
      () => authService.authenticateBearerToken(ownerLogin.accessToken),
      UnauthorizedException,
      "Token-version revocation must invalidate existing JWTs",
    );
    const newOwnerLogin = await authService.staffLogin({
      email: ownerEmail,
      password: ownerPassword,
    });
    assert(
      (await authService.authenticateBearerToken(newOwnerLogin.accessToken))
        .userId === ownerUser.id,
      "Owner may sign in again after revoking old tokens",
    );

    console.log(
      "Auth integration checks passed: seeded customer/owner/staff sign-in, password hashing, unverified customer auth, staff provisioning scope, JWT validation, and token revocation.",
    );
  } finally {
    await pool.end();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
