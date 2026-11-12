ALTER TABLE "alert_channels" ADD COLUMN "project" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "daily_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "max_run_minutes" integer;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "min_count" integer;--> statement-breakpoint
ALTER TABLE "checkin_pings" ADD COLUMN "count" integer;