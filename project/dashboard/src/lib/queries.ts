import { getSupabaseAdmin } from "./supabase";

export interface TicketRow {
  id: string;
  channel_id: string;
  user_id: string;
  claimer_id: string | null;
  status: "open" | "claimed" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface GiveawayRow {
  id: string;
  channel_id: string;
  message_id: string;
  prize: string;
  winners_count: number;
  end_at: string;
  host_id: string;
  status: "running" | "ended" | "cancelled";
  created_at: string;
  entries?: number;
}

export interface AuditRow {
  id: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface WelcomeConfig {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  message_template: string;
  role_id: string | null;
  media: Record<string, unknown>;
  component_template_id: string | null;
  updated_at: string;
}

export interface VerificationConfig {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
  method: "button" | "snowflake";
  restore_on_unverify: boolean;
  updated_at: string;
}

export interface ERLCServerRow {
  id: string;
  guild_id: string;
  name: string;
  base_url: string;
  enabled: boolean;
  updated_at: string;
}

/** Welcome-Konfiguration einer Guild (oder null). */
export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_welcome_config")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();
  if (error || !data) return null;
  return data as WelcomeConfig;
}

/** Verify-Konfiguration einer Guild (oder null). */
export async function getVerificationConfig(guildId: string): Promise<VerificationConfig | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_verification_config")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();
  if (error || !data) return null;
  return data as VerificationConfig;
}

/** ER:LC-Server einer Guild. */
export async function listERLCServers(guildId: string): Promise<ERLCServerRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_erlc_servers")
    .select("id, guild_id, name, base_url, enabled, updated_at")
    .eq("guild_id", guildId)
    .order("name", { ascending: true });
  if (error) return [];
  return (data ?? []) as ERLCServerRow[];
}

/** Zahl der Verifizierungen (Verify-Logs) einer Guild. */
export async function countVerificationLogs(guildId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_verification_logs")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId);
  if (error) return 0;
  return count ?? 0;
}

/** Alle Tickets einer Guild, neu zuerst. */
export async function listTickets(guildId: string): Promise<TicketRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_tickets")
    .select(
      "id, channel_id, user_id, claimer_id, status, created_at, closed_at"
    )
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as TicketRow[];
}

/** Giveaways einer Guild inkl. Teilnehmerzahl. */
export async function listGiveaways(guildId: string): Promise<GiveawayRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_giveaways")
    .select(
      "id, channel_id, message_id, prize, winners_count, end_at, host_id, status, created_at"
    )
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];

  const rows = (data ?? []) as GiveawayRow[];

  const entryCounts = await Promise.all(
    rows.map(async (g) => {
      const { count } = await getSupabaseAdmin()
        .from("berlin_roleplay_giveaway_entries")
        .select("user_id", { count: "exact", head: true })
        .eq("giveaway_id", g.id);
      return count ?? 0;
    })
  );

  return rows.map((g, i) => ({ ...g, entries: entryCounts[i] ?? 0 }));
}

/** Letzte Audit-Einträge einer Guild. */
export async function listAuditLogs(guildId: string, limit = 50): Promise<AuditRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_audit_logs")
    .select("id, actor_id, action, target_type, target_id, details, created_at")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as AuditRow[];
}
