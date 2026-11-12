CREATE TYPE "public"."recipe_status" AS ENUM('active', 'broken');--> statement-breakpoint
CREATE TABLE "recipes" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"anchors" jsonb NOT NULL,
	"defaults" jsonb NOT NULL,
	"status" "recipe_status" DEFAULT 'active' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"misses" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "recipes_vendor_idx" ON "recipes" USING btree ("vendor");