CREATE TYPE "public"."finding_status" AS ENUM('open', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."receipt_kind" AS ENUM('receipt', 'renewal_notice', 'plan_change', 'trial_notice', 'payment_failed', 'domain_or_dns', 'deployment', 'incident_alert', 'deprecation_notice', 'account_security', 'other');--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" "receipt_kind" NOT NULL,
	"vendor" text NOT NULL,
	"amount_cents" integer,
	"currency" text,
	"billed_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"due_at" timestamp with time zone,
	"plan" text,
	"project_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"domain_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"account_email" text,
	"card_last4" text,
	"invoice_id" text,
	"status" text,
	"cadence" text,
	"sender_verified" boolean DEFAULT false NOT NULL,
	"template_fingerprint" text,
	"confidence" real NOT NULL,
	"checks" jsonb DEFAULT '{"passed":[],"failed":[]}'::jsonb NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "evidence" jsonb DEFAULT '{"inbox":null,"subjects":[],"receiptIds":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "status" "finding_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tier1_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tier1_vendor" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tier1_confidence" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_error" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_message_uq" ON "receipts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "receipts_user_vendor_idx" ON "receipts" USING btree ("user_id","vendor");--> statement-breakpoint
CREATE INDEX "receipts_user_billed_idx" ON "receipts" USING btree ("user_id","billed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_user_key_uq" ON "findings" USING btree ("user_id","key");