ALTER TABLE "service_bays" ADD CONSTRAINT "service_bays_id_dealership_unique" UNIQUE("id","dealership_id");--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_id_dealership_unique" UNIQUE("id","dealership_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dealership_service_fk" FOREIGN KEY ("dealership_id","service_type_id") REFERENCES "public"."dealership_services"("dealership_id","service_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technician_dealership_fk" FOREIGN KEY ("assigned_technician_id","dealership_id") REFERENCES "public"."technicians"("id","dealership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bay_dealership_fk" FOREIGN KEY ("assigned_bay_id","dealership_id") REFERENCES "public"."service_bays"("id","dealership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technician_qualification_fk" FOREIGN KEY ("assigned_technician_id","service_type_id") REFERENCES "public"."technician_qualifications"("technician_id","service_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bay_capability_fk" FOREIGN KEY ("assigned_bay_id","service_type_id") REFERENCES "public"."bay_service_capabilities"("bay_id","service_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_technician_starts_idx" ON "appointments" USING btree ("assigned_technician_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_bay_starts_idx" ON "appointments" USING btree ("assigned_bay_id","starts_at");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "appointments"
	ADD CONSTRAINT "appointments_no_technician_overlap_confirmed_excl"
	EXCLUDE USING gist (
		"assigned_technician_id" WITH =,
		tstzrange("starts_at", "ends_at", '[)') WITH &&
	)
	WHERE ("status" = 'confirmed');--> statement-breakpoint
ALTER TABLE "appointments"
	ADD CONSTRAINT "appointments_no_bay_overlap_confirmed_excl"
	EXCLUDE USING gist (
		"assigned_bay_id" WITH =,
		tstzrange("starts_at", "ends_at", '[)') WITH &&
	)
	WHERE ("status" = 'confirmed');