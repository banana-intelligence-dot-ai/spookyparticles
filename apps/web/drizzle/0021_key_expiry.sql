CREATE TABLE "tracked_expirations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"provider" text,
	"hint" text,
	"project" text,
	"expires_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_expirations_kind_check" CHECK ("tracked_expirations"."kind" in ('api_key', 'token', 'certificate', 'other')),
	CONSTRAINT "tracked_expirations_name_check" CHECK (char_length("tracked_expirations"."name") between 1 and 80),
	CONSTRAINT "tracked_expirations_provider_check" CHECK ("tracked_expirations"."provider" is null or char_length("tracked_expirations"."provider") <= 40),
	CONSTRAINT "tracked_expirations_hint_check" CHECK ("tracked_expirations"."hint" is null or char_length("tracked_expirations"."hint") <= 6),
	CONSTRAINT "tracked_expirations_project_check" CHECK ("tracked_expirations"."project" is null or char_length("tracked_expirations"."project") <= 120)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_expirations" ADD CONSTRAINT "tracked_expirations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_expirations_user_expires_idx" ON "tracked_expirations" USING btree ("user_id","expires_on");