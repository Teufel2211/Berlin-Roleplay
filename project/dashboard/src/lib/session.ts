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

  const { data, error } = await getSupabaseAdmin()
    .from("berlin_roleplay_sessions")
    .select(
      "session_token, expires_at, user_id, users!berlin_roleplay_sessions_user_id_fkey(id, username, global_name, avatar)"
    )
    .eq("session_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const session = data as unknown as {
    session_token: string;
    expires_at: string;
    user: {
      id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
    };
  };

  if (new Date(session.expires_at) <= new Date()) return null;

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
    id: session.user.id,
    username: session.user.username,
    global_name: session.user.global_name,
    avatar: session.user.avatar,
    token: session.session_token,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await getSupabaseAdmin()
    .from("berlin_roleplay_sessions")
    .delete()
    .eq("session_token", token);
}
