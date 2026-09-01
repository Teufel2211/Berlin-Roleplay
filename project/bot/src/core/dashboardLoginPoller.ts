import { type Client } from "discord.js";
import { type SupabaseClient } from "@supabase/supabase-js";
import { TABLES, withRetry } from "../core/db.js";
import type { Logger } from "../core/logger.js";

interface DashboardLoginRow {
  id: string;
  code: string;
  discord_id: string;
  status: string;
}

/**
 * Pollt alle offenen Dashboard-Login-Codes (`pending`) und schickt sie per
 * Discord-DM an alle Admins der Guild. Markiert danach `sent`.
 *
 * Grund: Das Vercel-Dashboard ist serverless und kann keine dauerhafte
 * Discord-Verbindung halten. Der Bot hat die Verbindung, also verteilt er
 * die Codes an die Admins, die sie dem Einlogger mitteilen.
 */
export class DashboardLoginPoller {
  readonly #db: SupabaseClient;
  readonly #client: Client;
  readonly #logger: Logger;
  readonly #guildId: string | null;

  constructor(
    db: SupabaseClient,
    client: Client,
    logger: Logger,
    guildId: string | null,
  ) {
    this.#db = db;
    this.#client = client;
    this.#logger = logger;
    this.#guildId = guildId;
  }

  start(intervalMs: number): void {
    const run = (): void => {
      void this.poll().catch((err) => {
        this.#logger.warn(`Dashboard-Login-Poll fehlgeschlagen: ${String(err)}`);
      });
    };
    run();
    setInterval(run, intervalMs);
  }

  async poll(): Promise<void> {
    if (!this.#guildId) return;

    // Erst Codes abgeholt haben, die schon ~1s alt sind, damit der
    // erzeugende Request (Vercel) die Insert-Race nicht "abholt".
    const cutoff = new Date(Date.now() - 1500).toISOString();

    const { data: pending, error } = await withRetry(() =>
      this.#db
        .from(TABLES.dashboardLogins)
        .select("id, code, discord_id, status, created_at")
        .eq("status", "pending")
        .lt("created_at", cutoff),
    );

    if (error) {
      this.#logger.warn(`Dashboard-Login laden fehlgeschlagen: ${error.message}`);
      return;
    }
    const rows = (pending ?? []) as unknown as (DashboardLoginRow & { created_at: string })[];

    const adminIds = await this.#adminIds();
    if (adminIds.length === 0) {
      this.#logger.warn("Dashboard-Login: keine Admins gefunden, Codes bleiben pending.");
      return;
    }

    for (const row of rows) {
      let deliveredCount = 0;
      for (const adminId of adminIds) {
        try {
          const user = await this.#client.users.fetch(adminId);
          await user.send(
            `Jemand möchte sich im Dashboard anmelden.\n\n**Discord-ID:** \`${row.discord_id}\`\n**Login-Code:** \`${row.code}\``,
          );
          deliveredCount++;
        } catch (err) {
          this.#logger.warn(
            `Dashboard-Login: DM an Admin ${adminId} fehlgeschlagen: ${String(err)}`,
          );
        }
      }

      // Egal ob zugestellt oder nicht -> als "sent" markieren, sonst loop.
      await withRetry(() =>
        this.#db
          .from(TABLES.dashboardLogins)
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id),
      );

      this.#logger.info(
        `Dashboard-Login: Code ${row.code} für Discord-ID ${row.discord_id} an ${deliveredCount}/${adminIds.length} Admins gesendet.`,
      );
    }
  }

  async #adminIds(): Promise<string[]> {
    const { data, error } = await withRetry(() =>
      this.#db
        .from(TABLES.members)
        .select("user_id")
        .eq("guild_id", this.#guildId!)
        .eq("role", "admin"),
    );
    if (error) {
      this.#logger.warn(`Dashboard-Login: Admins laden fehlgeschlagen: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => r.user_id as string);
  }
}
