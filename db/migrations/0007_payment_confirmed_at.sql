-- When a payment became confirmed, for counting confirmed payments over a time window.
-- Purely additive: a nullable column, a trigger that maintains it, and a partial index.
-- No existing column, constraint, or API behavior changes.

ALTER TABLE payment ADD COLUMN confirmed_at TIMESTAMPTZ;

-- Backfill already-confirmed payments from updated_at, without bumping updated_at.
-- DISABLE TRIGGER is transactional, so a failure here leaves the trigger enabled.
ALTER TABLE payment DISABLE TRIGGER trg_payment_updated_at;
UPDATE payment SET confirmed_at = updated_at WHERE status = 'confirmed';
ALTER TABLE payment ENABLE TRIGGER trg_payment_updated_at;

-- Keep confirmed_at in step with status:
--   becomes 'confirmed' (insert, or from another status) -> now()
--   any status other than 'confirmed'                    -> NULL
--   stays 'confirmed'                                    -> unchanged
CREATE FUNCTION set_payment_confirmed_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'confirmed' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed' THEN
            NEW.confirmed_at := now();
        END IF;
    ELSE
        NEW.confirmed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- Same lockdown as set_updated_at() in 0002: triggers only need EXECUTE at creation.
REVOKE ALL ON FUNCTION set_payment_confirmed_at() FROM PUBLIC;

CREATE TRIGGER trg_payment_confirmed_at BEFORE INSERT OR UPDATE OF status ON payment
    FOR EACH ROW EXECUTE FUNCTION set_payment_confirmed_at();

CREATE INDEX idx_payment_confirmed ON payment (household_id, confirmed_at)
    WHERE status = 'confirmed';
