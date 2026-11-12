CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"deploy_failed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_user_key_uq" ON "alerts" USING btree ("user_id","key");
--> statement-breakpoint
CREATE INDEX "alerts_user_created_idx" ON "alerts" USING btree ("user_id","created_at");
