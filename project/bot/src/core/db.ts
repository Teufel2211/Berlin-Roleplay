import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Tabellen-Map: alle Zugriffe über diese Namen (berlin_*). */
export const TABLES = {
  guilds: "berlin_roleplay_guilds",
  users: "berlin_roleplay_users",
  members: "berlin_roleplay_guild_members",
  ticketPanels: "berlin_roleplay_ticket_panels",
  tickets: "berlin_roleplay_tickets",
  ticketMessages: "berlin_roleplay_ticket_messages",
  ticketTranscripts: "berlin_roleplay_ticket_transcripts",
  giveaways: "berlin_roleplay_giveaways",
  giveawayEntries: "berlin_roleplay_giveaway_entries",
  welcomeConfig: "berlin_roleplay_welcome_config",
  verificationConfig: "berlin_roleplay_verification_config",
  verificationLogs: "berlin_roleplay_verification_logs",
  auditLogs: "berlin_roleplay_audit_logs",
  componentTemplates: "berlin_roleplay_component_templates",
  componentVersions: "berlin_roleplay_component_versions",
  botState: "berlin_roleplay_bot_state",
  erlcServers: "berlin_roleplay_erlc_servers",
  erlcPlayersCache: "berlin_roleplay_erlc_players_cache",
  erlcFactions: "berlin_roleplay_erlc_factions",
  erlcRanks: "berlin_roleplay_erlc_ranks",
  erlcDutyState: "berlin_roleplay_erlc_duty_state",
  erlcIncidents: "berlin_roleplay_erlc_incidents",
  erlcIncidentAssignees: "berlin_roleplay_erlc_incident_assignees",
  erlcNotifications: "berlin_roleplay_erlc_notifications",
  erlcStatusPanels: "berlin_roleplay_erlc_status_panels",
  erlcStatPeriods: "berlin_roleplay_erlc_stat_periods",
  erlcCommandHistory: "berlin_roleplay_erlc_command_history",
  erlcPermissions: "berlin_roleplay_erlc_permissions",
  erlcWebhookEvents: "berlin_roleplay_erlc_webhook_events",
  slashCommands: "berlin_roleplay_slash_commands",
  commandUsage: "berlin_roleplay_command_usage",
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

export function createDbClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Transiente Fehler mit Retry (Rate-Limit, Netz). */
export async function withRetry<T>(fn: () => T | PromiseLike<T>, attempts = 3, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * 2 ** i));
    }
  }
  throw lastError;
}