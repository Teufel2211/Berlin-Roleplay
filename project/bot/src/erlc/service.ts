import { type Client, type TextChannel } from "discord.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { V2MessageBuilder, type ErlcServerInfo } from "@berlin/shared";
import { TABLES, withRetry } from "../core/db.js";
import { ErlcClient } from "./client.js";
import type { Logger } from "../core/logger.js";

export interface ErlcServerRow {
  id: string;
  guild_id: string;
  name: string;
  api_key_enc: string;
  base_url: string;
  enabled: boolean;
}

interface StatusPanelRow {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  refresh_interval_sec: number;
}

interface DutyRow {
  guild_id: string;
  user_id: string;
  server_id: string;
  roblox_id: string;
  discord_id: string;
  duty: boolean;
  since: string | null;
  updated_at: string;
}

interface IncidentRow {
  id: string;
  guild_id: string;
  server_id: string;
  type: string;
  location: string;
  description: string;
  created_by: string;
  status: "open" | "responding" | "closed";
  created_at: string;
  closed_at: string | null;
}

/** Von der ER:LC-API gelieferter Spieler (Teilmenge der Felder). */
interface PlayerRow {
  id: string;
  name?: string;
  factionId?: string | null;
  rankId?: string;
  duty?: boolean;
}

/**
 * ER:LC-Polling-Service: lädt je Server (aus `berlin_roleplay_erlc_servers`)
 * Status/Spieler/Faktionen/Ränge, schreibt die Caches und refresh Status-Panels.
 */
export class ErlcService {
  readonly #db: SupabaseClient;
  readonly #logger: Logger;
  #client?: Client;
  #timer?: NodeJS.Timeout;
  #syncRunning = false;

  constructor(db: SupabaseClient, logger: Logger) {
    this.#db = db;
    this.#logger = logger;
  }

  /** Discord-Client setzen (für Panel-Aktualisierung). */
  attach(client: Client): void {
    this.#client = client;
  }

  /** Polling starten (alle `syncIntervalSeconds`, Default 60s). */
  start(syncIntervalSeconds = 60): void {
    if (this.#timer) return;
    void this.syncAll().catch(() => {});
    this.#timer = setInterval(() => {
      void this.syncAll().catch(() => {});
    }, syncIntervalSeconds * 1000);
    this.#timer.unref?.();
    this.#logger.info(`ER:LC-Polling gestartet (${syncIntervalSeconds}s)`);
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  /** Konfigurierte Server laden. */
  async listServers(): Promise<ErlcServerRow[]> {
    const { data, error } = await this.#db.from(TABLES.erlcServers).select("*").eq("enabled", true);
    if (error) {
      this.#logger.warn(`ER:LC-Server laden fehlgeschlagen: ${error.message}`);
      return [];
    }
    return (data ?? []) as ErlcServerRow[];
  }

  /** Kompletter Sync: für jeden aktiven Server Zustand laden + cachen. */
  async syncAll(): Promise<void> {
    if (this.#syncRunning) return;
    this.#syncRunning = true;
    try {
      const servers = await this.listServers();
      for (const server of servers) {
        try {
          await this.syncServer(server);
        } catch (err) {
          this.#logger.warn(`ER:LC-Sync fehlgeschlagen (${server.name}): ${String(err)}`);
        }
      }
    } finally {
      this.#syncRunning = false;
    }
  }

  async syncServer(server: ErlcServerRow): Promise<void> {
    const client = new ErlcClient(server.api_key_enc, server.base_url);
    const info = await client.fetchServer();
    if (!info.id) {
      this.#logger.warn(`ER:LC-Server ${server.name}: keine Server-ID.`);
      return;
    }

    await withRetry(async () => {
      const { error } = await this.#db
        .from(TABLES.erlcServers)
        .update({ name: info.name, updated_at: new Date().toISOString() })
        .eq("id", server.id);
      if (error) throw new Error(error.message);
    });

    const players = await client.fetchPlayers();
    await this.writePlayers(server.id, players);

    const factions = await client.fetchFactions();
    await this.syncFactions(server.id, factions);

    await this.refreshPanels(server, info);
  }

  private async writePlayers(serverId: string, players: PlayerRow[]): Promise<void> {
    for (const p of players) {
      await withRetry(async () => {
        const { error } = await this.#db.from(TABLES.erlcPlayersCache).upsert({
          server_id: serverId,
          roblox_id: String(p.id),
          username: p.name ?? String(p.id),
          faction_id: p.factionId ?? null,
          rank: p.rankId ?? null,
          duty: Boolean(p.duty),
          online: true,
          last_seen: new Date().toISOString(),
        }, { onConflict: "server_id,roblox_id" });
        if (error) throw new Error(error.message);
      });
    }
  }

  private async syncFactions(
    serverId: string,
    factions: { id: string; name: string; tag?: string; roles?: { id: string; name: string }[] }[],
  ): Promise<void> {
    for (const f of factions) {
      await withRetry(async () => {
        const { data, error } = await this.#db
          .from(TABLES.erlcFactions)
          .upsert({ server_id: serverId, erlc_id: String(f.id), name: f.name, tag: f.tag ?? "" }, { onConflict: "server_id,erlc_id" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (data) {
          const factionRow = data as { id: string };
          await this.syncRanks(factionRow.id, f.roles ?? []);
        }
      });
    }
  }

  private async syncRanks(
    factionId: string,
    ranks: { id: string; name: string }[],
  ): Promise<void> {
    for (const r of ranks) {
      await withRetry(async () => {
        const { error } = await this.#db
          .from(TABLES.erlcRanks)
          .upsert({ faction_id: factionId, erlc_id: String(r.id), name: r.name }, { onConflict: "faction_id,erlc_id" });
        if (error) throw new Error(error.message);
      });
    }
  }

  /** Status-Panels dieser Guild neu aufbauen (Discord-Nachricht editieren). */
  async refreshPanels(server: ErlcServerRow, info: ErlcServerInfo): Promise<void> {
    if (!this.#client) return;
    const { data, error } = await this.#db
      .from(TABLES.erlcStatusPanels)
      .select("*")
      .eq("guild_id", server.guild_id);
    if (error) return;

    const panels = (data ?? []) as StatusPanelRow[];
    for (const panel of panels) {
      try {
        await this.renderPanel(panel, info);
      } catch (err) {
        this.#logger.warn(`Panel-Refresh fehlgeschlagen (${panel.id}): ${String(err)}`);
      }
    }
  }

  private async renderPanel(panel: StatusPanelRow, info: ErlcServerInfo): Promise<void> {
    const channel = await this.#client!.channels.fetch(panel.channel_id);
    if (!channel || !channel.isTextBased()) return;

    const payload = new V2MessageBuilder({
      version: 1,
      children: [
        { type: "text", content: `**Server-Status: ${info.name}**`, style: "heading" },
        { type: "text", content: `🟢 Online – ${info.players}/${info.maxPlayers} Spieler, Warteschlange: ${info.queue}` },
        { type: "text", content: `Map: ${info.currentMap} · Version ${info.branch} (${info.version})` },
        { type: "separator", line: true },
        { type: "text", content: `Letzte Aktualisierung: <t:${Math.floor(Date.now() / 1000)}:R>` },
      ],
    }).build();

    if (panel.message_id) {
      const message = await (channel as TextChannel).messages.fetch(panel.message_id);
      await message.edit({ components: payload.components });
    } else {
      const sent = await (channel as TextChannel).send(payload);
      await this.#db
        .from(TABLES.erlcStatusPanels)
        .update({ message_id: sent.id })
        .eq("id", panel.id);
    }
  }

  // ===========================================================================
  // Phase 5 – Duty / Incidents / Notify / Stats / Perms / Command-History
  // ===========================================================================

  /** Aktiven ER:LC-Client für einen Guild-Server liefern (erster Server), sonst null. */
  clientForGuild(guildId: string): Promise<ErlcClient | null> {
    return this.firstServer(guildId).then((server) =>
      server ? new ErlcClient(server.api_key_enc, server.base_url) : null,
    );
  }

  async firstServer(guildId: string): Promise<ErlcServerRow | null> {
    const { data, error } = await this.#db
      .from(TABLES.erlcServers)
      .select("*")
      .eq("guild_id", guildId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      this.#logger.warn(`ER:LC-Server laden fehlgeschlagen (Guild ${guildId}): ${error.message}`);
      return null;
    }
    return (data as ErlcServerRow) ?? null;
  }

  /** Duty-Status eines Users setzen oder abrufen. */
  async setDuty(
    guildId: string,
    userId: string,
    server: ErlcServerRow,
    robloxId: string,
    duty: boolean,
  ): Promise<DutyRow> {
    const now = new Date().toISOString();
    const row: DutyRow = {
      guild_id: guildId,
      user_id: userId,
      server_id: server.id,
      roblox_id: robloxId,
      discord_id: userId,
      duty,
      since: duty ? now : null,
      updated_at: now,
    };
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcDutyState).upsert(row, {
        onConflict: "guild_id,user_id,server_id",
      });
      if (error) throw new Error(error.message);
    });
    return row;
  }

  async getDuty(guildId: string, userId: string, serverId: string): Promise<DutyRow | null> {
    const { data, error } = await this.#db
      .from(TABLES.erlcDutyState)
      .select("*")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .eq("server_id", serverId)
      .maybeSingle();
    if (error) throw new Error(`Duty-Status laden fehlgeschlagen: ${error.message}`);
    return (data as DutyRow) ?? null;
  }

  /** Vorfall erstellen. */
  async createIncident(input: {
    guildId: string;
    serverId: string;
    createdBy: string;
    description: string;
    type?: string;
    location?: string;
  }): Promise<IncidentRow> {
    const { data, error } = await withRetry(() =>
      this.#db
        .from(TABLES.erlcIncidents)
        .insert({
          guild_id: input.guildId,
          server_id: input.serverId,
          created_by: input.createdBy,
          description: input.description,
          type: input.type ?? "",
          location: input.location ?? "",
        })
        .select()
        .single(),
    );
    if (error || !data) throw new Error(`Vorfall erstellen fehlgeschlagen: ${error?.message}`);
    return data as IncidentRow;
  }

  async closeIncident(id: string): Promise<void> {
    const { error } = await withRetry(() =>
      this.#db
        .from(TABLES.erlcIncidents)
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", id),
    );
    if (error) throw new Error(`Vorfall schließen fehlgeschlagen: ${error.message}`);
  }

  async openIncidents(guildId: string): Promise<IncidentRow[]> {
    const { data, error } = await withRetry(() =>
      this.#db
        .from(TABLES.erlcIncidents)
        .select("*")
        .eq("guild_id", guildId)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(20),
    );
    if (error) throw new Error(`Vorfälle laden fehlgeschlagen: ${error.message}`);
    return (data ?? []) as IncidentRow[];
  }

  async assignIncident(incidentId: string, userIds: string[]): Promise<void> {
    await withRetry(async () => {
      const rows = userIds.map((uid) => ({ incident_id: incidentId, user_id: uid }));
      const { error } = await this.#db.from(TABLES.erlcIncidentAssignees).insert(rows);
      if (error) throw new Error(error.message);
    });
  }

  /** Benachrichtigung loggen. */
  async logNotification(guildId: string, serverId: string | null, payload: Record<string, unknown>): Promise<void> {
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcNotifications).insert({
        guild_id: guildId,
        server_id: serverId,
        payload,
      });
      if (error) throw new Error(error.message);
    });
  }

  /** Statistiken je Zeitraum schreiben. */
  async recordStats(serverId: string, period: string, data: Record<string, unknown>): Promise<void> {
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcStatPeriods).upsert(
        { server_id: serverId, period, data, computed_at: new Date().toISOString() },
        { onConflict: "server_id,period" },
      );
      if (error) throw new Error(error.message);
    });
  }

  async getStats(serverId: string, period: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.#db
      .from(TABLES.erlcStatPeriods)
      .select("data")
      .eq("server_id", serverId)
      .eq("period", period)
      .maybeSingle();
    if (error) throw new Error(`Statistiken laden fehlgeschlagen: ${error.message}`);
    return (data?.data as Record<string, unknown> | undefined) ?? null;
  }

  /** ER:LC-Befehl senden + Antwort protokollieren. */
  async execCommand(
    guildId: string,
    server: ErlcServerRow,
    executorId: string,
    command: string,
  ): Promise<{ success: boolean; response?: unknown }> {
    const client = new ErlcClient(server.api_key_enc, server.base_url);
    const result = await client.sendCommand(command);
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcCommandHistory).insert({
        guild_id: guildId,
        server_id: server.id,
        executor_id: executorId,
        command,
        success: result.success,
        response: result.data ?? null,
      });
      if (error) throw new Error(error.message);
    });
    return { success: result.success, response: result.data };
  }

  /** Berechtigung für eine ER:LC-Command-Rolle setzen. */
  async setPermission(guildId: string, command: string, allowRole: string | null): Promise<void> {
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcPermissions).upsert(
        { guild_id: guildId, command, allow_role: allowRole },
        { onConflict: "guild_id,command" },
      );
      if (error) throw new Error(error.message);
    });
  }

  async getPermission(guildId: string, command: string): Promise<{ command: string; allow_role: string | null } | null> {
    const { data, error } = await this.#db
      .from(TABLES.erlcPermissions)
      .select("command,allow_role")
      .eq("guild_id", guildId)
      .eq("command", command)
      .maybeSingle();
    if (error) throw new Error(`Berechtigung laden fehlgeschlagen: ${error.message}`);
    return (data as { command: string; allow_role: string | null } | undefined) ?? null;
  }

  /** Status-Panel-Datensatz anlegen. */
  async dbInsertStatusPanel(guildId: string, channelId: string, messageId: string): Promise<void> {
    await withRetry(async () => {
      const { error } = await this.#db.from(TABLES.erlcStatusPanels).insert({
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
      });
      if (error) throw new Error(error.message);
    });
  }

  /** Status-Panel(s) in einem Kanal löschen. */
  async dbDeleteStatusPanel(guildId: string, channelId: string): Promise<void> {
    await withRetry(async () => {
      const { error } = await this.#db
        .from(TABLES.erlcStatusPanels)
        .delete()
        .eq("guild_id", guildId)
        .eq("channel_id", channelId);
      if (error) throw new Error(error.message);
    });
  }
}