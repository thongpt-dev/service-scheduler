CREATE TABLE "dealership_customers" (
	"dealership_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_customers_pk" PRIMARY KEY("dealership_id","customer_id")
);
--> statement-breakpoint
ALTER TABLE "dealership_customers" ADD CONSTRAINT "dealership_customers_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_customers" ADD CONSTRAINT "dealership_customers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealership_customers" ADD CONSTRAINT "dealership_customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealership_customers_customer_idx" ON "dealership_customers" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_name_unique" UNIQUE("name");