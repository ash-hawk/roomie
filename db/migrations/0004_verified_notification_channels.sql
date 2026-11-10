-- Verify notification destinations separately from sign-in, keep important-event
-- notifications opt-in, and leave the delivery model ready for a future SMS channel.
-- Applied by scripts/migrate.ts in one transaction. No application role receives grants.

-- Notifications are an explicit choice on each new event. Existing events are also
-- disabled so enabling the sender later cannot unexpectedly queue an old event.
ALTER TABLE event
    RENAME COLUMN email_roommates TO notify_roommates;

UPDATE event
SET notify_roommates = false
WHERE notify_roommates = true;

ALTER TABLE event
    ALTER COLUMN notify_roommates SET DEFAULT false;

-- A notification destination belongs to the user, while notification_setting remains
-- per household. SMS is represented in the schema but is not implemented by the app yet.
CREATE TABLE notification_channel (
    user_id                BIGINT NOT NULL
                           REFERENCES users(user_id) ON DELETE CASCADE,
    channel                TEXT NOT NULL
                           CHECK (channel IN ('email', 'sms')),
    destination            TEXT NOT NULL,
    normalized_destination TEXT NOT NULL,
    verified_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, channel),
    CHECK (char_length(destination) BETWEEN 3 AND 320),
    CHECK (char_length(normalized_destination) BETWEEN 3 AND 320),
    CHECK (channel <> 'sms' OR char_length(normalized_destination) <= 32)
);

-- Changing the destination always requires confirmation again. Case-only email changes
-- do not reset verification because the application stores a lowercase normalized value.
CREATE FUNCTION reset_notification_channel_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.normalized_destination IS DISTINCT FROM OLD.normalized_destination THEN
        NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION reset_notification_channel_verification() FROM PUBLIC;

CREATE TRIGGER trg_notification_channel_reset_verification
    BEFORE UPDATE OF destination, normalized_destination ON notification_channel
    FOR EACH ROW EXECUTE FUNCTION reset_notification_channel_verification();

CREATE TRIGGER trg_notification_channel_updated_at
    BEFORE UPDATE ON notification_channel
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only SHA-256 token hashes and server-secret HMAC-SHA-256 destination hashes are stored.
-- The raw token exists only in the confirmation email. used_at is claimed atomically by
-- the API, making every token single use. The two indexes support per-user and per-address
-- send limits. These rows intentionally survive deleting/re-adding a channel so rate-limit
-- history cannot be reset that way; deleting the user still removes them.
CREATE TABLE notification_channel_confirmation (
    confirmation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL
                     REFERENCES users(user_id) ON DELETE CASCADE,
    channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    destination_hash BYTEA NOT NULL CHECK (octet_length(destination_hash) = 32),
    token_hash       BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (expires_at <= created_at + interval '25 hours'),
    CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE INDEX idx_notification_confirmation_user_rate
    ON notification_channel_confirmation (user_id, channel, created_at DESC);

CREATE INDEX idx_notification_confirmation_address_rate
    ON notification_channel_confirmation (channel, destination_hash, created_at DESC);

CREATE INDEX idx_notification_confirmation_expiry
    ON notification_channel_confirmation (expires_at)
    WHERE used_at IS NULL;

-- Preferences and delivery identity include the channel now. Existing rows are email.
ALTER TABLE notification_setting
    DROP CONSTRAINT notification_setting_channel_check,
    ADD CONSTRAINT notification_setting_channel_check
        CHECK (channel IN ('email', 'sms'));

ALTER TABLE email_outbox
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'
        CHECK (channel IN ('email', 'sms'));

ALTER TABLE email_outbox
    DROP CONSTRAINT email_outbox_user_id_kind_source_type_source_id_key,
    ADD CONSTRAINT email_outbox_user_channel_kind_source_key
        UNIQUE (user_id, channel, kind, source_type, source_id);

-- 0001 already revoked default privileges. Repeat explicit revokes here so this migration
-- stays locked down even if it is reviewed or replayed independently from that history.
REVOKE ALL ON notification_channel, notification_channel_confirmation
    FROM authenticated, anonymous;
REVOKE ALL ON SEQUENCE notification_channel_confirmation_confirmation_id_seq
    FROM authenticated, anonymous;
REVOKE ALL ON FUNCTION reset_notification_channel_verification()
    FROM authenticated, anonymous;
