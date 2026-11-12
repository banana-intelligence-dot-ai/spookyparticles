CREATE TABLE "check_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"check_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text,
	"pr_url" text,
	"note" text,
	"reported_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "check_attempts" ADD CONSTRAINT "check_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_attempts" ADD CONSTRAINT "check_attempts_check_id_project_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."project_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_attempts_user_check_idx" ON "check_attempts" USING btree ("user_id","check_id");--> statement-breakpoint
ALTER TABLE "check_attempts" ADD CONSTRAINT "check_attempts_outcome_valid" CHECK ("outcome" IS NULL OR "outcome" IN ('pr_opened', 'told_person', 'could_not_fix', 'not_a_problem'));
--> statement-breakpoint
CREATE FUNCTION check_attempts_guard_take() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE finding project_checks%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id, 0));
  SELECT * INTO finding FROM project_checks WHERE id = NEW.check_id AND user_id = NEW.user_id;
  IF NOT FOUND OR finding.state <> 'open' OR finding.dismissed_at IS NOT NULL OR finding.first_open_at IS NULL THEN
    RAISE EXCEPTION 'Finding is no longer open' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM check_attempts a JOIN project_checks c ON c.id = a.check_id WHERE a.user_id = NEW.user_id AND a.reported_at IS NULL AND a.taken_at > now() - interval '2 hours' AND c.state = 'open' AND c.dismissed_at IS NULL AND a.taken_at >= c.first_open_at) THEN
    RAISE EXCEPTION 'Another finding is in progress' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM check_attempts WHERE user_id = NEW.user_id AND check_id = NEW.check_id AND taken_at >= finding.first_open_at) >= 3 OR
     EXISTS (SELECT 1 FROM check_attempts WHERE user_id = NEW.user_id AND check_id = NEW.check_id AND taken_at >= finding.first_open_at AND outcome = 'not_a_problem') OR
     EXISTS (SELECT 1 FROM check_attempts WHERE user_id = NEW.user_id AND check_id = NEW.check_id AND taken_at >= finding.first_open_at AND outcome IN ('pr_opened', 'told_person') AND reported_at > now() - interval '7 days') THEN
    RAISE EXCEPTION 'Finding is waiting or has reached its attempt limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER check_attempts_guard_take BEFORE INSERT ON check_attempts FOR EACH ROW EXECUTE FUNCTION check_attempts_guard_take();
