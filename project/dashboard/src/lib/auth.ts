import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionByToken, type SessionUser } from "./session";
import { getSupabaseAdmin } from "./supabase";

/**
 * Gibt die aktuelle Session zurueck oder `null` wenn nicht eingeloggt.
 * Wird in Server-Komponenten/Route-Handlern verwendet.
 */
export async function requireAuth(): Promise<SessionUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionByToken(token) : null;
  if (!user) redirect("/login");
  return user;
}

export interface GuildSummary {
  id: string;
  name: string;
  owner_id: string;
  role: "user" | "staff" | "admin";
  premium: boolean;
}

/**
 * Holt alle Guilds, in denen der User Mitglied ist (mit seiner Rolle).
 */
export async function getUserGuilds(userId: string): Promise<GuildSummary[]> {
  // Bewusst ohne Nested-Embed (postgREST PGRST200), daher zwei Abfragen.
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_guild_members")
    .select("role, guild_id")
    .eq("user_id", userId);

  if (error || !data) return [];

  const row = data as unknown as { role: GuildSummary["role"]; guild_id: string }[];
  const guilds = row.filter((r) => r.guild_id);

  if (guilds.length === 0) return [];

  const guildIds = guilds.map((g) => g.guild_id);

  const { data: guildRows, error: guildErr } = await getSupabaseAdmin()
    .from("berlin_roleplay_guilds")
    .select("id, name, owner_id, premium")
    .in("id", guildIds);

  if (guildErr || !guildRows) return [];

  const byId = new Map<string, Record<string, unknown>>(
    (guildRows as unknown as Record<string, unknown>[]).map((g) => [g.id as string, g])
  );

  return guilds
    .map((m) => {
      const guild = byId.get(m.guild_id);
      if (!guild || typeof guild.id !== "string") return null;
      return {
        id: guild.id,
        name: typeof guild.name === "string" ? guild.name : "",
        owner_id: typeof guild.owner_id === "string" ? guild.owner_id : "",
        premium: guild.premium === true,
        role: m.role,
      };
    })
    .filter((g): g is GuildSummary => g !== null);
}
