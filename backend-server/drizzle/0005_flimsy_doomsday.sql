CREATE TABLE "user_provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_provider_credentials" ADD CONSTRAINT "user_provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_credentials_user_provider_unique" ON "user_provider_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_provider_credentials_user_idx" ON "user_provider_credentials" USING btree ("user_id");