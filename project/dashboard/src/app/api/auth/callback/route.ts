import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/session";

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

  if (error || !code) {
    return NextResponse.redirect(
      `${env.appBaseUrl}/login?error=${encodeURIComponent(
        error ?? "missing_code"
      )}`
    );
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.discordClientId,
        client_secret: env.discordClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.discordRedirectUri,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error("token exchange failed: " + tokenRes.status);
    }
    const token = (await tokenRes.json()) as DiscordTokenResponse;

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new Error("identify failed");
    const me = (await meRes.json()) as DiscordIdentify;

    await upsertDiscordUser(me);

    let guildId: string | null = null;
    if (env.guildId) {
      await ensureGuildMember(me.id, env.guildId);
      guildId = env.guildId;
    }

    const sessionToken = await createSession(me.id, guildId);

    const res = NextResponse.redirect(
      `${env.appBaseUrl}${guildId ? "/dashboard" : "/login"}`
    );
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: env.appBaseUrl.startsWith("https"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("auth callback error", err);
    return NextResponse.redirect(
      `${env.appBaseUrl}/login?error=${encodeURIComponent("callback_failed")}`
    );
  }
}

async function upsertDiscordUser(me: DiscordIdentify) {
  const { error } = await getSupabaseAdmin().rpc("upsert_discord_user", {
    p_id: me.id,
    p_username: me.username,
    p_global_name: me.global_name,
    p_avatar: me.avatar,
  });
  if (error) throw new Error(`upsert user: ${error.message}`);
}

/**
 * Stellt sicher, dass die Guild existiert und der User als Mitglied mit
 * Default-Rolle 'user' eingetragen ist. Existiert die Guild nicht im DB,
 * wird sie (mit leeren Settings) angelegt — der Bot befuellt sie spaeter
 * vollstaendig. Nur die Ziel-Guild (`DISCORD_GUILD_ID`) wird zugelassen.
 */
async function ensureGuildMember(userId: string, guildId: string) {
  const { data: guild, error: guildErr } = await getSupabaseAdmin()
    .from("berlin_roleplay_guilds")
    .select("id")
    .eq("id", guildId)
    .maybeSingle();

  if (guildErr) throw new Error(`guild select: ${guildErr.message}`);

  if (!guild) {
    const { error: insertErr } = await getSupabaseAdmin()
      .from("berlin_roleplay_guilds")
      .insert({ id: guildId, name: "", owner_id: "" });
    if (insertErr) throw new Error(`guild insert: ${insertErr.message}`);
  }

  const { error: memberErr } = await getSupabaseAdmin()
    .from("berlin_roleplay_guild_members")
    .upsert(
      { guild_id: guildId, user_id: userId, role: "user" },
      { onConflict: "guild_id,user_id" }
    );
  if (memberErr) throw new Error(`member upsert: ${memberErr.message}`);
}

