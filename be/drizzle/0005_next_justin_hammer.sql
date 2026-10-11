CREATE TABLE "refresh_token_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_token_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "refresh_token_sessions_hash_check" CHECK ("refresh_token_sessions"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "refresh_token_sessions_version_check" CHECK ("refresh_token_sessions"."token_version" >= 0),
	CONSTRAINT "refresh_token_sessions_expiry_check" CHECK ("refresh_token_sessions"."expires_at" > "refresh_token_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "refresh_token_sessions" ADD CONSTRAINT "refresh_token_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_token_sessions_user_idx" ON "refresh_token_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "refresh_token_sessions_family_idx" ON "refresh_token_sessions" USING btree ("family_id");