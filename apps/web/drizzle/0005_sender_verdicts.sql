CREATE TYPE "public"."sender_verdict" AS ENUM('software_vendor', 'consumer', 'finance', 'shipping', 'notifications', 'personal', 'unknown');--> statement-breakpoint
CREATE TABLE "sender_verdicts" (
	"domain" text PRIMARY KEY NOT NULL,
	"verdict" "sender_verdict" NOT NULL,
	"vendor" text,
	"confidence" real NOT NULL,
	"model" text NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
