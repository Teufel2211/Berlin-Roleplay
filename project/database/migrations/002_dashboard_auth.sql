-- ============================================================================
-- Berlin Roleplay — 002_dashboard_auth.sql
-- Dashboard-Auth: Session-Tabelle + RLS-Policies für `authenticated`-Zugriff.
-- Bot nutzt weiterhin Service-Role (bypasst RLS). Dashboard nutzt
-- `authenticated` mit Staff/Admin-Policies gemäß Spec §3.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Sessions für Dashboard-Login (Discord OAuth2)
--    session_token  = zufälliger 32-Byte-Hex, in HttpOnly-Cookie gespeichert
--    expires_at     = Ablaufzeit (slide: verlängert bei Aktivität)
-- ---------------------------------------------------------------------------
CREATE TABLE berlin_roleplay_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL REFERENCES berlin_roleplay_users(id) ON DELETE CASCADE,
  guild_id      text        REFERENCES berlin_roleplay_guilds(id)  ON DELETE CASCADE,
  session_token text        NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_expires ON berlin_roleplay_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 2) RLS auf allen relevanten Tabellen aktivieren (if not already)
-- ---------------------------------------------------------------------------
ALTER TABLE berlin_roleplay_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Policies — `authenticated` (Dashboard)
--    Regelmodell: User darf nur Daten seiner eigenen Guild sehen/ändern.
--    `berlin_roleplay_guild_members.role IN ('staff','admin')` ist der Gate.
-- ---------------------------------------------------------------------------

-- users: jeder eingeloggte User darf sein eigenes Profil lesen/aktualisieren
CREATE POLICY "users_select_own" ON berlin_roleplay_users
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

CREATE POLICY "users_update_own" ON berlin_roleplay_users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text);

-- guild_members: User darf seine eigene Mitgliedschaft sehen
CREATE POLICY "guild_members_select_own" ON berlin_roleplay_guild_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- guilds: User darf Guilds sehen, in denen er Mitglied ist
CREATE POLICY "guilds_select_member" ON berlin_roleplay_guilds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_guild_members gm
      WHERE gm.guild_id = id AND gm.user_id = auth.uid()::text
    )
  );

-- staff/admin: SELECT auf Feature-Tabellen der eigenen Guild
-- (wird pro Feature-Tabelle via helper-Funktion gemacht)
CREATE OR REPLACE FUNCTION public.is_dashboard_staff(guild_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM berlin_roleplay_guild_members gm
    WHERE gm.guild_id = $1
      AND gm.user_id = auth.uid()::text
      AND gm.role IN ('staff', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_dashboard_admin(guild_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM berlin_roleplay_guild_members gm
    WHERE gm.guild_id = $1
      AND gm.user_id = auth.uid()::text
      AND gm.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) Feature-Tabellen: staff kann lesen, admin kann schreiben (eigene Guild)
--    -- Tickets --
-- ---------------------------------------------------------------------------
CREATE POLICY "tickets_select_staff" ON berlin_roleplay_tickets
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "tickets_update_admin" ON berlin_roleplay_tickets
  FOR UPDATE TO authenticated USING (is_dashboard_admin(guild_id));
CREATE POLICY "ticket_panels_select_staff" ON berlin_roleplay_ticket_panels
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "ticket_panels_write_admin" ON berlin_roleplay_ticket_panels
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

-- Giveaways
CREATE POLICY "giveaways_select_staff" ON berlin_roleplay_giveaways
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "giveaways_write_admin" ON berlin_roleplay_giveaways
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

-- Welcome / Verify
CREATE POLICY "welcome_config_select_staff" ON berlin_roleplay_welcome_config
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "welcome_config_write_admin" ON berlin_roleplay_welcome_config
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

CREATE POLICY "verification_config_select_staff" ON berlin_roleplay_verification_config
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "verification_config_write_admin" ON berlin_roleplay_verification_config
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

-- Audit (read-only)
CREATE POLICY "audit_logs_select_staff" ON berlin_roleplay_audit_logs
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));

-- Command usage / Stats (read-only für staff)
CREATE POLICY "command_usage_select_staff" ON berlin_roleplay_command_usage
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));

-- ERLC-Server (staff kann Liste sehen, admin darf verwalten)
CREATE POLICY "erlc_servers_select_staff" ON berlin_roleplay_erlc_servers
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_servers_write_admin" ON berlin_roleplay_erlc_servers
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

-- Sessions: User darf nur eigene Sessions sehen/löschen (via user_id)
CREATE POLICY "sessions_select_own" ON berlin_roleplay_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "sessions_delete_own" ON berlin_roleplay_sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 5) Funktion zum Anlegen/Einloggen eines Discord-Users (Dashboard)
--    Wird von API-Route (Service-Role) aufgerufen — die Policy-Gates oben
--    gelten nur für direkte `authenticated`-Zugriffe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_discord_user(
  p_id         text,
  p_username   text,
  p_global_name text,
  p_avatar     text
) RETURNS berlin_roleplay_users AS $$
  INSERT INTO berlin_roleplay_users (id, username, global_name, avatar)
  VALUES (p_id, p_username, p_global_name, p_avatar)
  ON CONFLICT (id) DO UPDATE SET
    username     = EXCLUDED.username,
    global_name  = EXCLUDED.global_name,
    avatar       = COALESCE(EXCLUDED.avatar, berlin_roleplay_users.avatar),
    updated_at   = now()
  RETURNING *;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;

-- Trigger: updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sessions_updated
  BEFORE UPDATE ON berlin_roleplay_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
