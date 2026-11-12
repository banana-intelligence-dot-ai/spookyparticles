CREATE TABLE "vendor_scope_overrides" (
	"user_id" text NOT NULL,
	"vendor_key" text NOT NULL,
	"scope" "vendor_scope" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_scope_overrides" ADD CONSTRAINT "vendor_scope_overrides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_scope_overrides_uq" ON "vendor_scope_overrides" USING btree ("user_id","vendor_key");