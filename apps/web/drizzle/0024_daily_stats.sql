CREATE TABLE "checkin_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"day" text NOT NULL,
	"main_name" text NOT NULL,
	"main_value" integer NOT NULL,
	"main_week" integer,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkin_stats" ADD CONSTRAINT "checkin_stats_job_id_checkin_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."checkin_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_stats_job_day_uq" ON "checkin_stats" USING btree ("job_id","day");