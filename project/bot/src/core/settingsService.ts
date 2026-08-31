import {
  resolveSettings,
  type GuildSettings,
} from "@berlin/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES } from "./db.js";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  settings: GuildSettings;
  loadedAt: number;
}

interface WelcomeConfigRow {
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
  message_template: string;
  welcome_roles: unknown;
}

interface VerificationConfigRow {
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
  method: "button" | "checkbox" | null;
  panel_message_id: string | null;
}

/**
 * Settings-Service: liest `berlin_roleplay_guilds.settings` (JSONB),
 * merged mit Defaults (resolveSettings), Cache 60s + gezielte Invalidierung.
 */
export class SettingsService {
  readonly #db: SupabaseClient;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async get(guildId: string): Promise<GuildSettings> {
    const cached = this.#cache.get(guildId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.settings;
    }

    const { data, error } = await this.#db
      .from(TABLES.guilds)
      .select("settings")
      .eq("id", guildId)
      .maybeSingle();

    if (error) {
      throw new Error(`Settings laden fehlgeschlagen (Guild ${guildId}): ${error.message}`);
    }

    const settings = resolveSettings(data?.settings ?? {});
    await this.#mergeConfigTables(guildId, settings);
    this.#cache.set(guildId, { settings, loadedAt: Date.now() });
    return settings;
  }

  /**
   * Dedizierte Welcome-/Verify-Config-Tabellen sind die Primärquelle für die
   * zugehörigen Felder (und die Rollen verified / welcomeRoles). Werte werden
   * über die JSONB-Settings gelegt, sofern in der Tabelle gesetzt.
   */
  async #mergeConfigTables(guildId: string, settings: GuildSettings): Promise<void> {
    const [welcome, verification] = await Promise.all([
      this.#db
        .from(TABLES.welcomeConfig)
        .select("enabled, channel_id, role_id, message_template, welcome_roles")
        .eq("guild_id", guildId)
        .maybeSingle<WelcomeConfigRow>(),
      this.#db
        .from(TABLES.verificationConfig)
        .select("enabled, channel_id, role_id, method, panel_message_id")
        .eq("guild_id", guildId)
        .maybeSingle<VerificationConfigRow>(),
    ]);

    if (!welcome.error && welcome.data) {
      settings.welcome.enabled = welcome.data.enabled;
      if (welcome.data.channel_id) settings.welcome.channelId = welcome.data.channel_id;
      if (welcome.data.message_template) settings.welcome.messageTemplate = welcome.data.message_template;
      // Mehrere Rollen: aus welcome_roles (Jsonb-Array) + role_id (Kompatibilität) zusammenführen.
      const roles = Array.isArray(welcome.data.welcome_roles)
        ? (welcome.data.welcome_roles as unknown[]).filter((r): r is string => typeof r === "string")
        : [];
      if (welcome.data.role_id) roles.push(welcome.data.role_id);
      if (roles.length > 0) settings.roles.welcomeRoles = [...new Set(roles)];
    }

    if (!verification.error && verification.data) {
      settings.verification.enabled = verification.data.enabled;
      if (verification.data.channel_id) settings.verification.channelId = verification.data.channel_id;
      if (verification.data.panel_message_id) settings.verification.panelMessageId = verification.data.panel_message_id;
      if (verification.data.method === "button" || verification.data.method === "checkbox") {
        settings.verification.method = verification.data.method;
      }
      if (verification.data.role_id) settings.roles.verified = verification.data.role_id;
    }
  }

  /** Guild-Eintrag mit Default-Settings anlegen (falls nicht vorhanden). */
  async provision(guildId: string, guildName: string): Promise<void> {
    const { data, error } = await this.#db
      .from(TABLES.guilds)
      .upsert(
        { id: guildId, name: guildName },
        { onConflict: "id", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (error && !error.message.includes("duplicate key")) {
      throw new Error(`Guild anlegen fehlgeschlagen (${guildId}): ${error.message}`);
    }
    if (!data) void data;
    this.#cache.delete(guildId);
  }

  /** Welcome-Kanal setzen (Tabelle als Primärquelle) und Settings syncen. */
  async setWelcomeChannel(guildId: string, channelId: string): Promise<void> {
    await this.#upsertWelcome(guildId, { channel_id: channelId, enabled: true });
  }

  /** Welcome-System ein-/ausschalten. */
  async setWelcomeEnabled(guildId: string, enabled: boolean): Promise<void> {
    await this.#upsertWelcome(guildId, { enabled });
  }

  async #upsertWelcome(guildId: string, row: Record<string, unknown>): Promise<void> {
    const { error } = await this.#db
      .from(TABLES.welcomeConfig)
      .upsert(
        { guild_id: guildId, ...row, updated_at: new Date().toISOString() },
        { onConflict: "guild_id" },
      );
    if (error) {
      throw new Error(`Welcome-Config speichern fehlgeschlagen (${guildId}): ${error.message}`);
    }
    this.#cache.delete(guildId);
  }

  /** Verify-Panel setzen (Tabelle als Primärquelle) und Settings syncen. */
  async setVerificationPanel(
    guildId: string,
    row: { channelId: string; panelMessageId: string; method: "button" | "checkbox" },
  ): Promise<void> {
    const { error } = await this.#db
      .from(TABLES.verificationConfig)
      .upsert(
        {
          guild_id: guildId,
          channel_id: row.channelId,
          panel_message_id: row.panelMessageId,
          method: row.method,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" },
      );
    if (error) {
      throw new Error(`Verify-Config speichern fehlgeschlagen (${guildId}): ${error.message}`);
    }
    this.#cache.delete(guildId);
  }

  /** Verify-System ein-/ausschalten. */
  async setVerificationEnabled(guildId: string, enabled: boolean): Promise<void> {
    const { error } = await this.#db
      .from(TABLES.verificationConfig)
      .upsert(
        { guild_id: guildId, enabled, updated_at: new Date().toISOString() },
        { onConflict: "guild_id" },
      );
    if (error) {
      throw new Error(`Verify-Config speichern fehlgeschlagen (${guildId}): ${error.message}`);
    }
    this.#cache.delete(guildId);
  }

  /** Partiell aktualisieren: Sektionen werden allenfalls deep-gemergt nutzergesetzt. */
  async update(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings> {
    const current = await this.get(guildId);

    // Patch als JSONB zusammenführen: konfigurierte Werte, Rest = bestehende.
    const merged = mergeSettings(current, patch);
    const { error } = await this.#db
      .from(TABLES.guilds)
      .update({ settings: merged })
      .eq("id", guildId);

    if (error) {
      throw new Error(`Settings speichern fehlgeschlagen (Guild ${guildId}): ${error.message}`);
    }

    // Cache neu aufbauen statt nur invalidieren (ein Roundtrip gespart).
    this.#cache.set(guildId, { settings: merged, loadedAt: Date.now() });
    return merged;
  }

  invalidate(guildId: string): void {
    this.#cache.delete(guildId);
  }
}

function mergeSettings(current: GuildSettings, patch: Partial<GuildSettings>): GuildSettings {
  const out: GuildSettings = structuredClone(current);

  const patchRoles = patch.roles;
  if (patchRoles) {
    for (const [key, value] of Object.entries(patchRoles)) {
      if (value !== undefined) {
        (out.roles as Record<string, unknown>)[key] = value;
      }
    }
  }
  const patchTicket = patch.ticket;
  if (patchTicket) {
    for (const [key, value] of Object.entries(patchTicket)) {
      if (value !== undefined) {
        (out.ticket as Record<string, unknown>)[key] = value;
      }
    }
  }

  const copy = <K extends keyof GuildSettings>(
    section: K,
  ): void => {
    // Nicht-Sektionsebenen einfach ersetzen, Sektionen oben verarbeitet.
    const value = patch[section];
    if (value !== undefined && !Array.isArray(value) && typeof value === "object") {
      out[section] = { ...out[section], ...value } as GuildSettings[K];
    } else if (value !== undefined) {
      out[section] = value;
    }
  };

  copy("giveaway");
  copy("welcome");
  copy("verification");
  copy("erlc");
  copy("audit");

  return out;
}