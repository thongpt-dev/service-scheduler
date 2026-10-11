CREATE TYPE "public"."appointment_audit_action" AS ENUM('cancelled', 'rescheduled', 'completed', 'no_show');--> statement-breakpoint
CREATE TABLE "appointment_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "appointment_audit_action" NOT NULL,
	"previous_status" "appointment_status" NOT NULL,
	"new_status" "appointment_status" NOT NULL,
	"previous_starts_at" timestamp with time zone,
	"new_starts_at" timestamp with time zone,
	"previous_ends_at" timestamp with time zone,
	"new_ends_at" timestamp with time zone,
	"previous_technician_id" uuid,
	"new_technician_id" uuid,
	"previous_bay_id" uuid,
	"new_bay_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_previous_technician_id_technicians_id_fk" FOREIGN KEY ("previous_technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_new_technician_id_technicians_id_fk" FOREIGN KEY ("new_technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_previous_bay_id_service_bays_id_fk" FOREIGN KEY ("previous_bay_id") REFERENCES "public"."service_bays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_audit_events" ADD CONSTRAINT "appointment_audit_events_new_bay_id_service_bays_id_fk" FOREIGN KEY ("new_bay_id") REFERENCES "public"."service_bays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_audit_events_appointment_created_idx" ON "appointment_audit_events" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointment_audit_events_actor_created_idx" ON "appointment_audit_events" USING btree ("actor_user_id","created_at");