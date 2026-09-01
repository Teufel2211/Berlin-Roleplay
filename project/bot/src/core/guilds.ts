import { type Client, type Guild } from "discord.js";
import { TABLES, withRetry } from "./db.js";
import type { createDbClient } from "./db.js";
import type { SettingsService } from "./settingsService.js";
import type { Logger } from "./logger.js";

/** Guild-Verwaltung: Provisioning, Abfrage, Soft-Delete. */
export class GuildsService {
  readonly #db: ReturnType<typeof createDbClient>;
  readonly #settingsService: SettingsService;
  readonly #logger: Logger;
  readonly #knownGuilds = new Set<string>();

  constructor(
    db: ReturnType<typeof createDbClient>,
    settingsService: SettingsService,
    logger: Logger,
  ) {
    this.#db = db;
    this.#settingsService = settingsService;
    this.#logger = logger;
  }

  /** Beim Bot-Start alle Guilds provisionieren, in denen der Bot ist. */
  async warmUp(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
      await this.ensure(guild);
    }
  }

  /** Guild-Eintrag anlegen (falls fehlt), Cache merken. */
  async ensure(guild: Guild): Promise<void> {
    if (this.#knownGuilds.has(guild.id)) return;

    try {
      await withRetry(async () => {
        const { error } = await this.#db.from(TABLES.guilds).upsert({
          id: guild.id,
          name: guild.name,
          owner_id: guild.ownerId,
          settings: {},
        }, { onConflict: "id" });
        if (error) throw new Error(`Guild upsert fehlgeschlagen: ${error.message}`);
      });
      await this.#settingsService.provision(guild.id, guild.name);
      this.#knownGuilds.add(guild.id);
      this.#logger.info(`Guild provisioniert: ${guild.name} (${guild.id})`);
    } catch (err) {
      this.#logger.warn(`Guild-Provisioning fehlgeschlagen (${guild.id}): ${String(err)}`);
    }
  }

  /** Guild aus Cache entfernen (bei GuildDelete). */
  forget(guildId: string): void {
    this.#knownGuilds.delete(guildId);
    this.#settingsService.invalidate(guildId);
  }
}