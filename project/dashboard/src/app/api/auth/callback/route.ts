import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { OAUTH_STATE_COOKIE } from "../login/route";

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DiscordIdentify {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const expectedState = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${OAUTH_STATE_COOKIE}=`))?.split("=").slice(1).join("=");

  const fail = (reason: string) => NextResponse.redirect(`${env.appBaseUrl}/login?error=${encodeURIComponent(reason)}`);
  if (error || !code) return fail(error ?? "missing_code");
  if (!state || !expectedState || state.length !== expectedState.length || !constantTimeEqual(state, expectedState)) return fail("invalid_oauth_state");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.discordClientId, client_secret: env.discordClientSecret, grant_type: "authorization_code", code, redirect_uri: env.discordRedirectUri }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const token = (await tokenRes.json()) as DiscordTokenResponse;

    const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!meRes.ok) throw new Error("identify failed");
    const me = (await meRes.json()) as DiscordIdentify;
    await upsertDiscordUser(me);

    let guildId: string | null = null;
    if (env.guildId) {
      const allowed = await ensureGuildMember(me.id, env.guildId);
      if (!allowed) return fail("dashboard_access_denied");
      guildId = env.guildId;
    }

    const sessionToken = await createSession(me.id, guildId);
    const res = NextResponse.redirect(`${env.appBaseUrl}${guildId ? "/dashboard" : "/login"}`);
    res.cookies.set(SESSION_COOKIE, sessionToken, { httpOnly: true, secure: env.appBaseUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
    res.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: env.appBaseUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("auth callback error", err);
    return fail("callback_failed");
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function upsertDiscordUser(me: DiscordIdentify) {
  const { error } = await getSupabaseAdmin().rpc("upsert_discord_user", { p_id: me.id, p_username: me.username, p_global_name: me.global_name, p_avatar: me.avatar });
  if (error) throw new Error(`upsert user: ${error.message}`);
}

/** Only existing staff/admin memberships are allowed; OAuth login never downgrades them. */
async function ensureGuildMember(userId: string, guildId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data: guild, error: guildErr } = await db.from("berlin_roleplay_guilds").select("id").eq("id", guildId).maybeSingle();
  if (guildErr) throw new Error(`guild select: ${guildErr.message}`);
  if (!guild) return false;

  const { data: membership, error: memberErr } = await db.from("berlin_roleplay_guild_members").select("role").eq("guild_id", guildId).eq("user_id", userId).maybeSingle();
  if (memberErr) throw new Error(`member select: ${memberErr.message}`);
  if (!membership || !["staff", "admin"].includes(membership.role)) return false;
  return true;
}
