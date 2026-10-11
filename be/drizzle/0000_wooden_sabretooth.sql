CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."booking_channel" AS ENUM('customer_self_service', 'staff_assisted');--> statement-breakpoint
CREATE TYPE "public"."dealership_membership_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_ref" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"dealership_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"assigned_technician_id" uuid NOT NULL,
	"assigned_bay_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"booking_channel" "booking_channel" NOT NULL,
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"service_name_snapshot" varchar(180) NOT NULL,
	"duration_minutes_snapshot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_ref_unique" UNIQUE("appointment_ref"),
	CONSTRAINT "appointments_window_check" CHECK ("appointments"."starts_at" < "appointments"."ends_at"),
	CONSTRAINT "appointments_duration_check" CHECK ("appointments"."duration_minutes_snapshot" > 0 AND "appointments"."ends_at" = "appointments"."starts_at" + ("appointments"."duration_minutes_snapshot" * interval '1 minute'))
);
--> statement-breakpoint
CREATE TABLE "bay_service_capabilities" (
	"bay_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bay_service_capabilities_pk" PRIMARY KEY("bay_id","service_type_id")
);
--> statement-breakpoint
CREATE TABLE "customer_vehicle_access" (
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_vehicle_access_pk" PRIMARY KEY("customer_id","vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" varchar(320) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"phone" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email"),
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customers_email_lowercase_check" CHECK ("customers"."email" = lower("customers"."email"))
);
--> statement-breakpoint
CREATE TABLE "dealership_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_closures_window_check" CHECK ("dealership_closures"."starts_at" < "dealership_closures"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "dealership_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" time,
	"close_time" time,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_hours_dealer_day_unique" UNIQUE("dealership_id","day_of_week"),
	CONSTRAINT "dealership_hours_day_of_week_check" CHECK ("dealership_hours"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "dealership_hours_window_check" CHECK (("dealership_hours"."is_closed" AND "dealership_hours"."open_time" IS NULL AND "dealership_hours"."close_time" IS NULL) OR (NOT "dealership_hours"."is_closed" AND "dealership_hours"."open_time" IS NOT NULL AND "dealership_hours"."close_time" IS NOT NULL AND "dealership_hours"."open_time" < "dealership_hours"."close_time"))
);
--> statement-breakpoint
CREATE TABLE "dealership_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "dealership_membership_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_memberships_dealer_user_unique" UNIQUE("dealership_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dealership_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_services_unique" UNIQUE("dealership_id","service_type_id"),
	CONSTRAINT "dealership_services_duration_check" CHECK ("dealership_services"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "dealerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"address_line1" varchar(255) NOT NULL,
	"address_line2" varchar(255),
	"city" varchar(120) NOT NULL,
	"region" varchar(120) NOT NULL,
	"postal_code" varchar(32) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"timezone" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealerships_country_code_check" CHECK ("dealerships"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"appointment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_actor_operation_key_unique" UNIQUE("actor_user_id","operation","idempotency_key"),
	CONSTRAINT "idempotency_records_operation_check" CHECK (length(trim("idempotency_records"."operation")) > 0),
	CONSTRAINT "idempotency_records_request_hash_check" CHECK ("idempotency_records"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_records_expiry_check" CHECK ("idempotency_records"."expires_at" > "idempotency_records"."created_at" AND "idempotency_records"."expires_at" <= "idempotency_records"."created_at" + interval '24 hours')
);
--> statement-breakpoint
CREATE TABLE "service_bays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"bay_code" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_bays_dealer_code_unique" UNIQUE("dealership_id","bay_code")
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technician_leaves_window_check" CHECK ("technician_leaves"."starts_at" < "technician_leaves"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "technician_qualifications" (
	"technician_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technician_qualifications_pk" PRIMARY KEY("technician_id","service_type_id"),
	CONSTRAINT "technician_qualifications_valid_window_check" CHECK ("technician_qualifications"."valid_from" IS NULL OR "technician_qualifications"."valid_to" IS NULL OR "technician_qualifications"."valid_from" < "technician_qualifications"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "technician_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_local_time" time NOT NULL,
	"end_local_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technician_shifts_day_of_week_check" CHECK ("technician_shifts"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "technician_shifts_window_check" CHECK ("technician_shifts"."start_local_time" < "technician_shifts"."end_local_time")
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealership_id" uuid NOT NULL,
	"display_name" varchar(180) NOT NULL,
	"employee_code" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technicians_dealer_employee_code_unique" UNIQUE("dealership_id","employee_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"token_version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_token_version_check" CHECK ("users"."token_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_customer_id" uuid NOT NULL,
	"vin" varchar(17) NOT NULL,
	"make" varchar(120) NOT NULL,
	"model" varchar(120) NOT NULL,
	"year" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_vin_unique" UNIQUE("vin"),
	CONSTRAINT "vehicles_year_check" CHECK ("vehicles"."year" BETWEEN 1886 AND 9999)
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_technician_id_technicians_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_bay_id_service_bays_id_fk" FOREIGN KEY ("assigned_bay_id") REFERENCES "public"."service_bays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bay_service_capabilities" ADD CONSTRAINT "bay_service_capabilities_bay_id_service_bays_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."service_bays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bay_service_capabilities" ADD CONSTRAINT "bay_service_capabilities_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicle_access" ADD CONSTRAINT "customer_vehicle_access_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicle_access" ADD CONSTRAINT "customer_vehicle_access_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_closures" ADD CONSTRAINT "dealership_closures_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_hours" ADD CONSTRAINT "dealership_hours_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_memberships" ADD CONSTRAINT "dealership_memberships_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_memberships" ADD CONSTRAINT "dealership_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_services" ADD CONSTRAINT "dealership_services_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_services" ADD CONSTRAINT "dealership_services_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bays" ADD CONSTRAINT "service_bays_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_leaves" ADD CONSTRAINT "technician_leaves_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_qualifications" ADD CONSTRAINT "technician_qualifications_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_qualifications" ADD CONSTRAINT "technician_qualifications_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_shifts" ADD CONSTRAINT "technician_shifts_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_customer_id_customers_id_fk" FOREIGN KEY ("owner_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_customer_starts_idx" ON "appointments" USING btree ("customer_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_dealership_starts_idx" ON "appointments" USING btree ("dealership_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_status_starts_idx" ON "appointments" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "bay_service_capabilities_service_idx" ON "bay_service_capabilities" USING btree ("service_type_id");--> statement-breakpoint
CREATE INDEX "customer_vehicle_access_vehicle_idx" ON "customer_vehicle_access" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "dealership_closures_dealer_window_idx" ON "dealership_closures" USING btree ("dealership_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "dealership_hours_dealer_day_idx" ON "dealership_hours" USING btree ("dealership_id","day_of_week");--> statement-breakpoint
CREATE INDEX "dealership_memberships_user_idx" ON "dealership_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dealership_memberships_dealership_idx" ON "dealership_memberships" USING btree ("dealership_id");--> statement-breakpoint
CREATE INDEX "dealership_services_dealer_active_idx" ON "dealership_services" USING btree ("dealership_id","is_active");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "service_bays_dealer_active_idx" ON "service_bays" USING btree ("dealership_id","is_active");--> statement-breakpoint
CREATE INDEX "service_types_active_idx" ON "service_types" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "technician_leaves_technician_window_idx" ON "technician_leaves" USING btree ("technician_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "technician_shifts_technician_day_idx" ON "technician_shifts" USING btree ("technician_id","day_of_week");--> statement-breakpoint
CREATE INDEX "technicians_dealer_active_idx" ON "technicians" USING btree ("dealership_id","is_active");--> statement-breakpoint
CREATE INDEX "vehicles_owner_idx" ON "vehicles" USING btree ("owner_customer_id");