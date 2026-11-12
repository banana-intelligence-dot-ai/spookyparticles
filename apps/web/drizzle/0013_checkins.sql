CREATE TABLE "checkin_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"period_minutes" integer NOT NULL,
	"grace_minutes" integer DEFAULT 10 NOT NULL,
	"project" text,
	"status" text DEFAULT 'new' NOT NULL,
	"last_ping_at" timestamp with time zone,
	"last_ping_kind" text,
	"last_note" text,
	"next_due_at" timestamp with time zone,
	"miss_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"encrypted_target" text NOT NULL,
	"key_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD CONSTRAINT "checkin_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "checkin_pings" ADD CONSTRAINT "checkin_pings_job_id_checkin_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."checkin_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_jobs_token_uq" ON "checkin_jobs" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "checkin_jobs_user_idx" ON "checkin_jobs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "checkin_jobs_due_idx" ON "checkin_jobs" USING btree ("status","next_due_at");
--> statement-breakpoint
CREATE INDEX "checkin_pings_job_at_idx" ON "checkin_pings" USING btree ("job_id","at");
--> statement-breakpoint
CREATE INDEX "alert_channels_user_idx" ON "alert_channels" USING btree ("user_id");
