import { type SupabaseClient } from "@supabase/supabase-js";
import { TABLES, withRetry } from "../core/db.js";

export interface Giveaway {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  prize: string;
  winners_count: number;
  end_at: string;
  host_id: string;
  status: "running" | "ended" | "cancelled";
}

interface GiveawayRowInput {
  guild_id: string;
  channel_id: string;
  message_id: string;
  prize: string;
  winners_count: number;
  end_at: string;
  host_id: string;
  status?: "running" | "ended" | "cancelled";
}

/** Giveaway-Logik: DB-Zugriff, Teilnahme, Ziehung. */
export class GiveawayService {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: GiveawayRowInput): Promise<Giveaway> {
    const { data, error } = await withRetry(() =>
      this.db
        .from(TABLES.giveaways)
        .insert({ ...input, status: input.status ?? "running" })
        .select()
        .single(),
    );
    if (error || !data) throw new Error(`Giveaway erstellen fehlgeschlagen: ${error?.message}`);
    return data as Giveaway;
  }

  async findByMessage(guildId: string, messageId: string): Promise<Giveaway | null> {
    const { data, error } = await withRetry(() =>
      this.db
        .from(TABLES.giveaways)
        .select()
        .eq("guild_id", guildId)
        .eq("message_id", messageId)
        .maybeSingle(),
    );
    if (error) throw new Error(`Giveaway suchen fehlgeschlagen: ${error?.message}`);
    return (data as Giveaway) ?? null;
  }

  async addEntry(giveawayId: string, userId: string): Promise<boolean> {
    const { error } = await withRetry(() =>
      this.db.from(TABLES.giveawayEntries).upsert(
        { giveaway_id: giveawayId, user_id: userId },
        { onConflict: "giveaway_id,user_id", ignoreDuplicates: true },
      ),
    );
    if (error) throw new Error(`Giveaway-Teilnahme fehlgeschlagen: ${error?.message}`);
    return true;
  }

  async entries(giveawayId: string): Promise<string[]> {
    const { data, error } = await withRetry(() =>
      this.db.from(TABLES.giveawayEntries).select("user_id").eq("giveaway_id", giveawayId),
    );
    if (error) throw new Error(`Giveaway-Teilnehmer laden fehlgeschlagen: ${error?.message}`);
    return (data ?? []).map((r) => r.user_id as string);
  }

  async updateStatus(id: string, status: Giveaway["status"]): Promise<void> {
    const { error } = await withRetry(() =>
      this.db.from(TABLES.giveaways).update({ status }).eq("id", id),
    );
    if (error) throw new Error(`Giveaway-Status update fehlgeschlagen: ${error?.message}`);
  }

  /** Zufällige Gewinner aus den Entries ziehen (ohne Duplikate). */
  drawWinners(entries: string[], count: number): string[] {
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp!;
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}