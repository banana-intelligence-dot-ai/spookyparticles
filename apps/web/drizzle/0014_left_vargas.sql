ALTER TABLE "checkin_jobs" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "request_method" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "vercel_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "vercel_project_id" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "vercel_scope_id" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "vercel_deployment_id" text;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "last_evidence_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkin_jobs" ADD COLUMN "evidence_state" text;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_jobs_user_external_ref_uq" ON "checkin_jobs" USING btree ("user_id","external_ref");