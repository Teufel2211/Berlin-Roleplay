import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { env } from "./env";

export const SESSION_COOKIE = "br_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 Tage

export interface SessionUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  token: string;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Erstellt eine Session genuess der Dashboard-Anmeldung.
 * (Wird vom OAuth-Callback mit der Service-Rolle aufgerufen.)
 */
export async function createSession(
  userId: string,
  guildId: string | null
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from("berlin_roleplay_sessions")
    .insert({
      user_id: userId,
      guild_id: guildId,
      session_token: token,
      expires_at: expiresAt,
    });
  if (error) throw new Error(`session insert: ${error.message}`);
  return token;
}

/**
 * Liest die Session anhand des Tokens. Verlaengert (slide) bei Aktivitaet.
 * Gibt `null` zurueck, wenn abgelaufen oder unbekannt.
 */
export async function getSessionByToken(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null;

  // Bewusst ohne Nested-Embed: postgREST loest die FK-Relation
  // (berlin_roleplay_sessions -> berlin_roleplay_users) in manchen
  // Projekten nicht auf (PGRST200). Daher zwei getrennte Abfragen.
  const { data: session, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_sessions")
    .select("session_token, expires_at, user_id")
    .eq("session_token", token)
    .maybeSingle();

  if (error || !session) return null;

  if (new Date(session.expires_at) <= new Date()) return null;

  const { data: user, error: userErr } = await getSupabaseAdmin()
    .from("berlin_roleplay_users")
    .select("id, username, global_name, avatar")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userErr || !user) return null;

  // Slide: bei Aktivitaet um TTL verlaengern (best effort)
  const now = Date.now();
  const expires = new Date(session.expires_at).getTime();
  if (expires - now < SESSION_TTL_SECONDS * 5000) {
    await getSupabaseAdmin()
      .from("berlin_roleplay_sessions")
      .update({
        expires_at: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("session_token", token);
  }

  return {
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    avatar: user.avatar,
    token: session.session_token,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await getSupabaseAdmin()
    .from("berlin_roleplay_sessions")
    .delete()
    .eq("session_token", token);
}
