CREATE TABLE "dealership_vehicles" (
	"dealership_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_vehicles_pk" PRIMARY KEY("dealership_id","vehicle_id")
);
--> statement-breakpoint
ALTER TABLE "dealership_vehicles" ADD CONSTRAINT "dealership_vehicles_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_vehicles" ADD CONSTRAINT "dealership_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_vehicles" ADD CONSTRAINT "dealership_vehicles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealership_vehicles_vehicle_idx" ON "dealership_vehicles" USING btree ("vehicle_id");