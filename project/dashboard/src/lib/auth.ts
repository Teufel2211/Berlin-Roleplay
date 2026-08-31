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
  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_guild_members")
    .select(
      "role, guilds!berlin_roleplay_guild_members_guild_id_fkey(id, name, owner_id, premium)"
    )
    .eq("user_id", userId);

  if (error || !data) return [];

  return data
    .map((row: { role: unknown; guilds: unknown }) => {
      const guild = Array.isArray(row.guilds)
        ? (row.guilds as Record<string, unknown>[])[0]
        : (row.guilds as Record<string, unknown> | null);
      if (!guild || typeof guild.id !== "string") return null;
      return {
        id: guild.id,
        name: typeof guild.name === "string" ? guild.name : "",
        owner_id: typeof guild.owner_id === "string" ? guild.owner_id : "",
        premium: guild.premium === true,
        role: row.role as GuildSummary["role"],
      };
    })
    .filter((g): g is GuildSummary => g !== null);
}
