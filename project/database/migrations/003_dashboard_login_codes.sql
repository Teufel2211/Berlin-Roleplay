-- Berlin Roleplay - one-time dashboard login codes.
-- Codes are created by the dashboard API and delivered by the bot.

BEGIN;

CREATE TABLE berlin_roleplay_dashboard_logins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id  text        NOT NULL,
  code        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'used', 'expired')),
  expires_at  timestamptz NOT NULL,
  sent_at     timestamptz,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dashboard_logins_pending
  ON berlin_roleplay_dashboard_logins (status, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_dashboard_logins_lookup
  ON berlin_roleplay_dashboard_logins (discord_id, code);

ALTER TABLE berlin_roleplay_dashboard_logins ENABLE ROW LEVEL SECURITY;

COMMIT;
