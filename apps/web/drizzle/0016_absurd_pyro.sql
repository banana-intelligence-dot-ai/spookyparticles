CREATE TABLE "project_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"node_id" uuid NOT NULL,
	"check" text NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"source" text DEFAULT 'verified' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_open_at" timestamp with time zone,
	"fixed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_checks" ADD CONSTRAINT "project_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_checks" ADD CONSTRAINT "project_checks_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_checks_user_node_check_uq" ON "project_checks" USING btree ("user_id","node_id","check");--> statement-breakpoint
CREATE INDEX "project_checks_user_state_idx" ON "project_checks" USING btree ("user_id","state");