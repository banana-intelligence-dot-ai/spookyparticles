CREATE TYPE "public"."forum_kind" AS ENUM('feedback', 'tip');--> statement-breakpoint
CREATE TYPE "public"."forum_status" AS ENUM('pending', 'approved', 'held', 'hidden', 'open', 'answered');--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "forum_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"agent" text,
	"incident_id" text,
	"confirmed_fix" boolean DEFAULT false NOT NULL,
	"status" "forum_status" NOT NULL,
	"hold_reason" text,
	"answer" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_posts_title_check" CHECK (char_length("forum_posts"."title") between 1 and 120),
	CONSTRAINT "forum_posts_body_check" CHECK (char_length("forum_posts"."body") between 1 and 2000),
	CONSTRAINT "forum_posts_agent_check" CHECK ("forum_posts"."agent" is null or char_length("forum_posts"."agent") <= 40),
	CONSTRAINT "forum_posts_answer_check" CHECK ("forum_posts"."answer" is null or char_length("forum_posts"."answer") <= 2000),
	CONSTRAINT "forum_posts_kind_status_check" CHECK (("forum_posts"."kind" = 'feedback' and "forum_posts"."status" in ('open', 'answered', 'hidden')) or ("forum_posts"."kind" = 'tip' and "forum_posts"."status" in ('pending', 'approved', 'held', 'hidden')))
);
--> statement-breakpoint
CREATE TABLE "forum_worked" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_worked_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_worked" ADD CONSTRAINT "forum_worked_post_id_forum_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_worked" ADD CONSTRAINT "forum_worked_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_posts_kind_status_created_idx" ON "forum_posts" USING btree ("kind","status","created_at");--> statement-breakpoint
CREATE INDEX "forum_posts_user_id_idx" ON "forum_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forum_worked_user_id_idx" ON "forum_worked" USING btree ("user_id");