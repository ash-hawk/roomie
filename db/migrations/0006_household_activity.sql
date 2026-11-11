CREATE TABLE app_event (
    event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    household_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    action_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (household_id, user_id)
        REFERENCES household_member(household_id, user_id) ON DELETE CASCADE,
    UNIQUE (household_id, user_id, action_type, entity_id)
);

CREATE INDEX app_event_household_week_idx
    ON app_event (household_id, occurred_at, user_id);

DO $$
DECLARE role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['authenticated', 'anonymous'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON app_event FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON SEQUENCE app_event_event_id_seq FROM %I', role_name);
        END IF;
    END LOOP;
END;
$$;
