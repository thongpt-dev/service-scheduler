import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const dealershipMembershipRoleEnum = pgEnum(
  "dealership_membership_role",
  ["owner", "manager", "staff"],
);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

export const bookingChannelEnum = pgEnum("booking_channel", [
  "customer_self_service",
  "staff_assisted",
]);

export const appointmentAuditActionEnum = pgEnum("appointment_audit_action", [
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    tokenVersion: integer("token_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    check(
      "users_email_lowercase_check",
      sql`${table.email} = lower(${table.email})`,
    ),
    check("users_token_version_check", sql`${table.tokenVersion} >= 0`),
  ],
);

export const refreshTokenSessions = pgTable(
  "refresh_token_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenVersion: integer("token_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("refresh_token_sessions_token_hash_unique").on(table.tokenHash),
    index("refresh_token_sessions_user_idx").on(table.userId, table.expiresAt),
    index("refresh_token_sessions_family_idx").on(table.familyId),
    check(
      "refresh_token_sessions_hash_check",
      sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "refresh_token_sessions_version_check",
      sql`${table.tokenVersion} >= 0`,
    ),
    check(
      "refresh_token_sessions_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("customers_email_unique").on(table.email),
    unique("customers_user_id_unique").on(table.userId),
    check(
      "customers_email_lowercase_check",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
);

export const dealerships = pgTable(
  "dealerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 180 }).notNull(),
    addressLine1: varchar("address_line1", { length: 255 }).notNull(),
    addressLine2: varchar("address_line2", { length: 255 }),
    city: varchar("city", { length: 120 }).notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    postalCode: varchar("postal_code", { length: 32 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    timezone: varchar("timezone", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check(
      "dealerships_country_code_check",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
  ],
);

export const dealershipMemberships = pgTable(
  "dealership_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: dealershipMembershipRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("dealership_memberships_dealer_user_unique").on(
      table.dealershipId,
      table.userId,
    ),
    index("dealership_memberships_user_idx").on(table.userId),
    index("dealership_memberships_dealership_idx").on(table.dealershipId),
  ],
);

export const dealershipCustomers = pgTable(
  "dealership_customers",
  {
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "dealership_customers_pk",
      columns: [table.dealershipId, table.customerId],
    }),
    index("dealership_customers_customer_idx").on(table.customerId),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerCustomerId: uuid("owner_customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vin: varchar("vin", { length: 17 }).notNull(),
    make: varchar("make", { length: 120 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    year: integer("year").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("vehicles_vin_unique").on(table.vin),
    index("vehicles_owner_idx").on(table.ownerCustomerId),
    check("vehicles_year_check", sql`${table.year} BETWEEN 1886 AND 9999`),
  ],
);

export const dealershipVehicles = pgTable(
  "dealership_vehicles",
  {
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "dealership_vehicles_pk",
      columns: [table.dealershipId, table.vehicleId],
    }),
    index("dealership_vehicles_vehicle_idx").on(table.vehicleId),
  ],
);

export const customerVehicleAccess = pgTable(
  "customer_vehicle_access",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "customer_vehicle_access_pk",
      columns: [table.customerId, table.vehicleId],
    }),
    index("customer_vehicle_access_vehicle_idx").on(table.vehicleId),
  ],
);

export const serviceTypes = pgTable(
  "service_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("service_types_name_unique").on(table.name),
    index("service_types_active_idx").on(table.isActive),
  ],
);

export const dealershipServices = pgTable(
  "dealership_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id")
      .notNull()
      .references(() => serviceTypes.id, { onDelete: "restrict" }),
    durationMinutes: integer("duration_minutes").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("dealership_services_unique").on(
      table.dealershipId,
      table.serviceTypeId,
    ),
    index("dealership_services_dealer_active_idx").on(
      table.dealershipId,
      table.isActive,
    ),
    check(
      "dealership_services_duration_check",
      sql`${table.durationMinutes} > 0`,
    ),
  ],
);

export const dealershipHours = pgTable(
  "dealership_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openTime: time("open_time"),
    closeTime: time("close_time"),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("dealership_hours_dealer_day_unique").on(
      table.dealershipId,
      table.dayOfWeek,
    ),
    index("dealership_hours_dealer_day_idx").on(
      table.dealershipId,
      table.dayOfWeek,
    ),
    check(
      "dealership_hours_day_of_week_check",
      sql`${table.dayOfWeek} BETWEEN 0 AND 6`,
    ),
    check(
      "dealership_hours_window_check",
      sql`(${table.isClosed} AND ${table.openTime} IS NULL AND ${table.closeTime} IS NULL) OR (NOT ${table.isClosed} AND ${table.openTime} IS NOT NULL AND ${table.closeTime} IS NOT NULL AND ${table.openTime} < ${table.closeTime})`,
    ),
  ],
);

export const dealershipClosures = pgTable(
  "dealership_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 255 }),
    ...timestamps,
  },
  (table) => [
    index("dealership_closures_dealer_window_idx").on(
      table.dealershipId,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "dealership_closures_window_check",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
  ],
);

export const serviceBays = pgTable(
  "service_bays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    bayCode: varchar("bay_code", { length: 60 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("service_bays_dealer_code_unique").on(
      table.dealershipId,
      table.bayCode,
    ),
    unique("service_bays_id_dealership_unique").on(
      table.id,
      table.dealershipId,
    ),
    index("service_bays_dealer_active_idx").on(
      table.dealershipId,
      table.isActive,
    ),
  ],
);

export const bayServiceCapabilities = pgTable(
  "bay_service_capabilities",
  {
    bayId: uuid("bay_id")
      .notNull()
      .references(() => serviceBays.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id")
      .notNull()
      .references(() => serviceTypes.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "bay_service_capabilities_pk",
      columns: [table.bayId, table.serviceTypeId],
    }),
    index("bay_service_capabilities_service_idx").on(table.serviceTypeId),
  ],
);

export const technicians = pgTable(
  "technicians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 180 }).notNull(),
    employeeCode: varchar("employee_code", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("technicians_dealer_employee_code_unique").on(
      table.dealershipId,
      table.employeeCode,
    ),
    unique("technicians_id_dealership_unique").on(table.id, table.dealershipId),
    index("technicians_dealer_active_idx").on(
      table.dealershipId,
      table.isActive,
    ),
  ],
);

export const technicianQualifications = pgTable(
  "technician_qualifications",
  {
    technicianId: uuid("technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id")
      .notNull()
      .references(() => serviceTypes.id, { onDelete: "restrict" }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "technician_qualifications_pk",
      columns: [table.technicianId, table.serviceTypeId],
    }),
    check(
      "technician_qualifications_valid_window_check",
      sql`${table.validFrom} IS NULL OR ${table.validTo} IS NULL OR ${table.validFrom} < ${table.validTo}`,
    ),
  ],
);

export const technicianShifts = pgTable(
  "technician_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    technicianId: uuid("technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "restrict" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startLocalTime: time("start_local_time").notNull(),
    endLocalTime: time("end_local_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("technician_shifts_technician_day_idx").on(
      table.technicianId,
      table.dayOfWeek,
    ),
    check(
      "technician_shifts_day_of_week_check",
      sql`${table.dayOfWeek} BETWEEN 0 AND 6`,
    ),
    check(
      "technician_shifts_window_check",
      sql`${table.startLocalTime} < ${table.endLocalTime}`,
    ),
  ],
);

export const technicianLeaves = pgTable(
  "technician_leaves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    technicianId: uuid("technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 255 }),
    ...timestamps,
  },
  (table) => [
    index("technician_leaves_technician_window_idx").on(
      table.technicianId,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "technician_leaves_window_check",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentRef: varchar("appointment_ref", { length: 32 }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    dealershipId: uuid("dealership_id")
      .notNull()
      .references(() => dealerships.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id")
      .notNull()
      .references(() => serviceTypes.id, { onDelete: "restrict" }),
    assignedTechnicianId: uuid("assigned_technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "restrict" }),
    assignedBayId: uuid("assigned_bay_id")
      .notNull()
      .references(() => serviceBays.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bookingChannel: bookingChannelEnum("booking_channel").notNull(),
    status: appointmentStatusEnum("status").notNull().default("confirmed"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    serviceNameSnapshot: varchar("service_name_snapshot", {
      length: 180,
    }).notNull(),
    durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("appointments_ref_unique").on(table.appointmentRef),
    index("appointments_customer_starts_idx").on(
      table.customerId,
      table.startsAt,
    ),
    index("appointments_dealership_starts_idx").on(
      table.dealershipId,
      table.startsAt,
    ),
    index("appointments_status_starts_idx").on(table.status, table.startsAt),
    index("appointments_technician_starts_idx").on(
      table.assignedTechnicianId,
      table.startsAt,
    ),
    index("appointments_bay_starts_idx").on(
      table.assignedBayId,
      table.startsAt,
    ),
    foreignKey({
      name: "appointments_dealership_service_fk",
      columns: [table.dealershipId, table.serviceTypeId],
      foreignColumns: [
        dealershipServices.dealershipId,
        dealershipServices.serviceTypeId,
      ],
    }),
    foreignKey({
      name: "appointments_technician_dealership_fk",
      columns: [table.assignedTechnicianId, table.dealershipId],
      foreignColumns: [technicians.id, technicians.dealershipId],
    }),
    foreignKey({
      name: "appointments_bay_dealership_fk",
      columns: [table.assignedBayId, table.dealershipId],
      foreignColumns: [serviceBays.id, serviceBays.dealershipId],
    }),
    foreignKey({
      name: "appointments_technician_qualification_fk",
      columns: [table.assignedTechnicianId, table.serviceTypeId],
      foreignColumns: [
        technicianQualifications.technicianId,
        technicianQualifications.serviceTypeId,
      ],
    }),
    foreignKey({
      name: "appointments_bay_capability_fk",
      columns: [table.assignedBayId, table.serviceTypeId],
      foreignColumns: [
        bayServiceCapabilities.bayId,
        bayServiceCapabilities.serviceTypeId,
      ],
    }),
    check(
      "appointments_window_check",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
    check(
      "appointments_duration_check",
      sql`${table.durationMinutesSnapshot} > 0 AND ${table.endsAt} = ${table.startsAt} + (${table.durationMinutesSnapshot} * interval '1 minute')`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    operation: varchar("operation", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (table) => [
    unique("idempotency_actor_operation_key_unique").on(
      table.actorUserId,
      table.operation,
      table.idempotencyKey,
    ),
    index("idempotency_records_expires_idx").on(table.expiresAt),
    check(
      "idempotency_records_operation_check",
      sql`length(trim(${table.operation})) > 0`,
    ),
    check(
      "idempotency_records_request_hash_check",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "idempotency_records_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '24 hours'`,
    ),
  ],
);

export const appointmentAuditEvents = pgTable(
  "appointment_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: appointmentAuditActionEnum("action").notNull(),
    previousStatus: appointmentStatusEnum("previous_status").notNull(),
    newStatus: appointmentStatusEnum("new_status").notNull(),
    previousStartsAt: timestamp("previous_starts_at", { withTimezone: true }),
    newStartsAt: timestamp("new_starts_at", { withTimezone: true }),
    previousEndsAt: timestamp("previous_ends_at", { withTimezone: true }),
    newEndsAt: timestamp("new_ends_at", { withTimezone: true }),
    previousTechnicianId: uuid("previous_technician_id").references(
      () => technicians.id,
      { onDelete: "restrict" },
    ),
    newTechnicianId: uuid("new_technician_id").references(
      () => technicians.id,
      { onDelete: "restrict" },
    ),
    previousBayId: uuid("previous_bay_id").references(() => serviceBays.id, {
      onDelete: "restrict",
    }),
    newBayId: uuid("new_bay_id").references(() => serviceBays.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("appointment_audit_events_appointment_created_idx").on(
      table.appointmentId,
      table.createdAt,
    ),
    index("appointment_audit_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

export type DealershipMembershipRole =
  (typeof dealershipMembershipRoleEnum.enumValues)[number];
export type AppointmentStatus =
  (typeof appointmentStatusEnum.enumValues)[number];
export type BookingChannel = (typeof bookingChannelEnum.enumValues)[number];
export type AppointmentAuditAction =
  (typeof appointmentAuditActionEnum.enumValues)[number];
