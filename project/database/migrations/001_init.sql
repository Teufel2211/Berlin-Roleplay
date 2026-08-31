-- ============================================================================
-- Berlin Roleplay — 001_init.sql
-- Gilt als Initial-Migration: löscht alle Alt-Tabellen (eghr_*), legt alle
-- neuen berlin_roleplay_*-Tabellen gemäß Spec §3 an und aktiviert RLS.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Alte eghr_*-Tabellen entfernen (best effort, DROP IF EXISTS)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'eghr\_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";          -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- ILIKE-Suche/Ähnlichkeit

-- ---------------------------------------------------------------------------
-- 3) Kern / Guilds
-- ---------------------------------------------------------------------------
CREATE TABLE berlin_roleplay_guilds (
  id             text        PRIMARY KEY,             -- Discord-Guild-ID (Snowflake)
  name           text        NOT NULL DEFAULT '',
  owner_id       text        NOT NULL DEFAULT '',
  settings       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  feature_flags  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  premium        boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_users (
  id           text        PRIMARY KEY,               -- Discord-User-ID
  username     text        NOT NULL DEFAULT '',
  global_name  text,
  avatar       text,
  roles_cache  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_guild_members (
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  user_id     text        NOT NULL REFERENCES berlin_roleplay_users(id)   ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'user'
              CHECK (role IN ('user', 'staff', 'admin')),
  roles_cache jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4) Feature-Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE berlin_roleplay_ticket_panels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id        text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  channel_id      text        NOT NULL,
  message_id      text,
  title           text        NOT NULL,
  description     text        NOT NULL DEFAULT '',
  selection_type  text        NOT NULL DEFAULT 'button'
                  CHECK (selection_type IN ('button', 'select')),
  config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_tickets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  panel_id     uuid        REFERENCES berlin_roleplay_ticket_panels(id)  ON DELETE SET NULL,
  channel_id   text        NOT NULL,
  user_id      text        NOT NULL,
  claimer_id   text,
  status       text        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'claimed', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);

CREATE TABLE berlin_roleplay_ticket_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES berlin_roleplay_tickets(id) ON DELETE CASCADE,
  author_id   text        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_ticket_transcripts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid        NOT NULL REFERENCES berlin_roleplay_tickets(id) ON DELETE CASCADE,
  transcript jsonb       NOT NULL DEFAULT '{}'::jsonb,
  file_url   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_giveaways (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id      text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  channel_id    text        NOT NULL,
  message_id    text        NOT NULL,
  prize         text        NOT NULL,
  winners_count integer     NOT NULL DEFAULT 1 CHECK (winners_count >= 1),
  end_at        timestamptz NOT NULL,
  host_id       text        NOT NULL,
  status        text        NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'ended', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_giveaway_entries (
  giveaway_id uuid NOT NULL REFERENCES berlin_roleplay_giveaways(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE berlin_roleplay_component_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  version     integer     NOT NULL DEFAULT 1,
  payload     jsonb       NOT NULL,                    -- V2Layout
  is_global   boolean     NOT NULL DEFAULT false,
  flags       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_template_name_unique
  ON berlin_roleplay_component_templates (guild_id, lower(name));

CREATE TABLE berlin_roleplay_component_versions (
  template_id uuid        NOT NULL REFERENCES berlin_roleplay_component_templates(id) ON DELETE CASCADE,
  version     integer     NOT NULL,
  payload     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

CREATE TABLE berlin_roleplay_welcome_config (
  guild_id              text PRIMARY KEY REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  enabled               boolean     NOT NULL DEFAULT true,
  channel_id            text,
  message_template      text        NOT NULL DEFAULT '',
  role_id               text,
  media                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
  component_template_id uuid        REFERENCES berlin_roleplay_component_templates(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_verification_config (
  guild_id              text PRIMARY KEY REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  enabled               boolean     NOT NULL DEFAULT true,
  channel_id            text,
  role_id               text,
  method                text        NOT NULL DEFAULT 'button'
                        CHECK (method IN ('button', 'snowflake')),
  restore_on_unverify   boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_verification_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id   text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  user_id    text        NOT NULL,
  action     text        NOT NULL CHECK (action IN ('verify', 'unverify')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  actor_id    text        NOT NULL,
  action      text        NOT NULL,
  target_type text,
  target_id   text,
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_guild_created ON berlin_roleplay_audit_logs (guild_id, created_at DESC);

CREATE TABLE berlin_roleplay_bot_state (
  guild_id  text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  key       text        NOT NULL,
  value     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, key)
);

-- ---------------------------------------------------------------------------
-- 5) ERLC-Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE berlin_roleplay_erlc_servers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  api_key_enc text        NOT NULL,                     -- verschlüsselt (Vault/Env-Fallback)
  base_url    text        NOT NULL DEFAULT 'https://api.erlc.gg/v2',
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_erlc_players_cache (
  server_id   uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  roblox_id   text        NOT NULL,
  username    text        NOT NULL DEFAULT '',
  faction_id  text,
  rank        text,
  duty        boolean     NOT NULL DEFAULT false,
  online      boolean     NOT NULL DEFAULT false,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, roblox_id)
);

CREATE TABLE berlin_roleplay_erlc_factions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  erlc_id     text        NOT NULL,
  name        text        NOT NULL,
  tag         text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, erlc_id)
);

CREATE TABLE berlin_roleplay_erlc_ranks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id  uuid        NOT NULL REFERENCES berlin_roleplay_erlc_factions(id) ON DELETE CASCADE,
  erlc_id     text        NOT NULL,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (faction_id, erlc_id)
);

CREATE TABLE berlin_roleplay_erlc_duty_state (
  guild_id   text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  user_id    text        NOT NULL,
  server_id  uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  roblox_id  text        NOT NULL,
  discord_id text        NOT NULL,
  duty       boolean     NOT NULL DEFAULT false,
  since      timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, server_id)
);

CREATE TABLE berlin_roleplay_erlc_incidents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  server_id   uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  type        text        NOT NULL DEFAULT '',
  location    text        NOT NULL DEFAULT '',
  description text        NOT NULL DEFAULT '',
  created_by  text        NOT NULL DEFAULT '',
  status      text        NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'responding', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);

CREATE TABLE berlin_roleplay_erlc_incident_assignees (
  incident_id uuid NOT NULL REFERENCES berlin_roleplay_erlc_incidents(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, user_id)
);

CREATE TABLE berlin_roleplay_erlc_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  server_id   uuid        REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_erlc_status_panels (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id            text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  channel_id          text        NOT NULL,
  message_id          text,
  template_id         uuid        REFERENCES berlin_roleplay_component_templates(id) ON DELETE SET NULL,
  refresh_interval_sec integer    NOT NULL DEFAULT 60,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_erlc_stat_periods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  period      text        NOT NULL CHECK (period IN ('24h', '7d', '30d')),
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, period)
);

CREATE TABLE berlin_roleplay_erlc_command_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  server_id   uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  executor_id text        NOT NULL,
  command     text        NOT NULL,
  success     boolean     NOT NULL,
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE berlin_roleplay_erlc_permissions (
  guild_id   text NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  command    text NOT NULL,
  allow_role text,
  PRIMARY KEY (guild_id, command)
);

CREATE TABLE berlin_roleplay_erlc_webhook_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id   text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  server_id  uuid        NOT NULL REFERENCES berlin_roleplay_erlc_servers(id) ON DELETE CASCADE,
  event_type text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  verified   boolean     NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6) Commands / Stats
-- ---------------------------------------------------------------------------
CREATE TABLE berlin_roleplay_slash_commands (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     text        REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  registered   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, name)
);

CREATE TABLE berlin_roleplay_command_usage (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    text        NOT NULL REFERENCES berlin_roleplay_guilds(id) ON DELETE CASCADE,
  command     text        NOT NULL,
  user_id     text        NOT NULL,
  options     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_command_usage_guild_created ON berlin_roleplay_command_usage (guild_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7) RLS für alle neuen Tabellen aktivieren (Policies folgen in Migration 002+;
--    Bot nutzt Service-Role und umgeht RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE berlin_roleplay_guilds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_guild_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_ticket_panels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_ticket_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_ticket_transcripts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_giveaways             ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_giveaway_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_welcome_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_verification_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_verification_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_component_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_component_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_bot_state             ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_servers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_players_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_factions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_ranks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_duty_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_incidents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_incident_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_status_panels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_stat_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_command_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_erlc_webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_slash_commands        ENABLE ROW LEVEL SECURITY;
ALTER TABLE berlin_roleplay_command_usage         ENABLE ROW LEVEL SECURITY;

COMMIT;