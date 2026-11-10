-- Foundation for onboarding progress, opt-in event email delivery, and
-- serverless-safe AI usage limits. Applied by scripts/migrate.ts in one transaction.

-- Existing memberships should keep going straight to Home. New memberships leave
-- this NULL until the onboarding wizard is completed.
ALTER TABLE household_member
    ADD COLUMN onboarded_at TIMESTAMPTZ;

UPDATE household_member
SET onboarded_at = now()
WHERE onboarded_at IS NULL;

-- A missing row means the channel/kind is off. The composite foreign key ensures
-- settings can only exist for a real membership in that household.
CREATE TABLE notification_setting (
    user_id      BIGINT NOT NULL,
    household_id BIGINT NOT NULL,
    channel      TEXT NOT NULL CHECK (channel IN ('email')),
    kind         TEXT NOT NULL CHECK (kind IN (
                     'event_hosting', 'event_other', 'approval_request'
                 )),
    enabled      BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, household_id, channel, kind),
    FOREIGN KEY (household_id, user_id)
        REFERENCES household_member(household_id, user_id) ON DELETE CASCADE
);

ALTER TABLE event
    ADD COLUMN email_roommates BOOLEAN NOT NULL DEFAULT true;

-- Delivery is asynchronous and idempotent. source_type/source_id are intentionally
-- generic so the same outbox can later support digests and other opted-in emails.
CREATE TABLE email_outbox (
    email_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    household_id BIGINT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN (
                     'event_hosting', 'event_other', 'approval_request'
                 )),
    source_type  TEXT NOT NULL,
    source_id    BIGINT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error   TEXT,
    provider_id  TEXT,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (household_id, user_id)
        REFERENCES household_member(household_id, user_id) ON DELETE CASCADE,
    UNIQUE (user_id, kind, source_type, source_id),
    CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE TRIGGER trg_email_outbox_updated_at
    BEFORE UPDATE ON email_outbox
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_email_outbox_retry
    ON email_outbox (status, created_at)
    WHERE status IN ('pending', 'failed');

-- One append-only row per attempted AI feature call. Counting this index over the
-- last hour gives a limit shared by every Vercel function instance.
CREATE TABLE ai_usage (
    user_id      BIGINT NOT NULL,
    household_id BIGINT NOT NULL,
    feature      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (household_id, user_id)
        REFERENCES household_member(household_id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_usage_hourly
    ON ai_usage (user_id, household_id, feature, created_at DESC);
