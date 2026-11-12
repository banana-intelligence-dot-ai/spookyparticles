-- The audit log stays append-only, with one exception the privacy policy promises: when an
-- account is deleted, its rows lose everything that identifies the person or their accounts.
-- The only UPDATE allowed sets actor to 'deleted' and user_id, target, before and after to
-- empty, and leaves id, action and created_at unchanged. DELETE and TRUNCATE stay refused.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.action = OLD.action
     AND NEW.created_at = OLD.created_at
     AND NEW.actor = 'deleted'
     AND NEW.user_id IS NULL
     AND NEW.target = ''
     AND NEW.before IS NULL
     AND NEW.after IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;
