CREATE TYPE "public"."vendor_scope" AS ENUM('work', 'personal', 'unknown');--> statement-breakpoint
CREATE TABLE "vendor_verdicts" (
	"vendor_key" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"scope" "vendor_scope" NOT NULL,
	"confidence" real NOT NULL,
	"model" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
