-- Dashboard access policies for feature data not covered by the initial auth migration.

BEGIN;

CREATE POLICY "ticket_messages_select_staff" ON berlin_roleplay_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_tickets t
      WHERE t.id = ticket_id AND is_dashboard_staff(t.guild_id)
    )
  );

CREATE POLICY "ticket_transcripts_select_staff" ON berlin_roleplay_ticket_transcripts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_tickets t
      WHERE t.id = ticket_id AND is_dashboard_staff(t.guild_id)
    )
  );

CREATE POLICY "giveaway_entries_select_staff" ON berlin_roleplay_giveaway_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_giveaways g
      WHERE g.id = giveaway_id AND is_dashboard_staff(g.guild_id)
    )
  );

CREATE POLICY "verification_logs_select_staff" ON berlin_roleplay_verification_logs
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));

CREATE POLICY "component_templates_select_staff" ON berlin_roleplay_component_templates
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "component_templates_write_admin" ON berlin_roleplay_component_templates
  FOR ALL TO authenticated USING (is_dashboard_admin(guild_id))
  WITH CHECK (is_dashboard_admin(guild_id));

CREATE POLICY "component_versions_select_staff" ON berlin_roleplay_component_versions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_component_templates t
      WHERE t.id = template_id AND is_dashboard_staff(t.guild_id)
    )
  );

CREATE POLICY "bot_state_select_staff" ON berlin_roleplay_bot_state
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));

CREATE POLICY "erlc_players_select_staff" ON berlin_roleplay_erlc_players_cache
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_erlc_servers s
      WHERE s.id = server_id AND is_dashboard_staff(s.guild_id)
    )
  );
CREATE POLICY "erlc_factions_select_staff" ON berlin_roleplay_erlc_factions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_erlc_servers s
      WHERE s.id = server_id AND is_dashboard_staff(s.guild_id)
    )
  );
CREATE POLICY "erlc_ranks_select_staff" ON berlin_roleplay_erlc_ranks
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_erlc_servers s
      WHERE s.id = server_id AND is_dashboard_staff(s.guild_id)
    )
  );
CREATE POLICY "erlc_duty_select_staff" ON berlin_roleplay_erlc_duty_state
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_incidents_select_staff" ON berlin_roleplay_erlc_incidents
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_incident_assignees_select_staff" ON berlin_roleplay_erlc_incident_assignees
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_erlc_incidents i
      WHERE i.id = incident_id AND is_dashboard_staff(i.guild_id)
    )
  );
CREATE POLICY "erlc_notifications_select_staff" ON berlin_roleplay_erlc_notifications
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_status_panels_select_staff" ON berlin_roleplay_erlc_status_panels
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_stats_select_staff" ON berlin_roleplay_erlc_stat_periods
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM berlin_roleplay_erlc_servers s
      WHERE s.id = server_id AND is_dashboard_staff(s.guild_id)
    )
  );
CREATE POLICY "erlc_history_select_staff" ON berlin_roleplay_erlc_command_history
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_permissions_select_staff" ON berlin_roleplay_erlc_permissions
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));
CREATE POLICY "erlc_webhooks_select_staff" ON berlin_roleplay_erlc_webhook_events
  FOR SELECT TO authenticated USING (is_dashboard_staff(guild_id));

COMMIT;
