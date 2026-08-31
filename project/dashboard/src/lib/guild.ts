import { notFound } from "next/navigation";
import { requireAuth, getUserGuilds } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface GuildContext {
  guildId: string;
  guildName: string;
  role: "user" | "staff" | "admin";
  premium: boolean;
}

/**
 * Laedt eine Guild plus die Rolle des eingeloggten Users.
 * Wirft notFound(), wenn die Guild nicht existiert oder der User kein Mitglied ist.
 */
export async function requireGuild(guildId: string): Promise<GuildContext> {
  const user = await requireAuth();
  const guilds = await getUserGuilds(user.id);
  const membership = guilds.find((g) => g.id === guildId);
  if (!membership) notFound();

  return {
    guildId: membership.id,
    guildName: membership.name || "Unbenannter Server",
    role: membership.role,
    premium: membership.premium,
  };
}

export interface CountRow {
  count: number;
}

async function countRows(
  table: string,
  guildId: string
): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(table as any)
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Objekt mit offenen Ticket-/Giveaway-/Audit-Zaehlern fuer einen Karten-Ueberblick.
 */
export async function getGuildStats(guild: GuildContext) {
  const [openTickets, giveaways, auditCount] = await Promise.all([
    countRows("berlin_roleplay_tickets", guild.guildId),
    countRows("berlin_roleplay_giveaways", guild.guildId),
    countRows("berlin_roleplay_audit_logs", guild.guildId),
  ]);
  return { openTickets, giveaways, auditCount };
}
