import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { discordId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const discordId = body.discordId?.trim() ?? "";
  const code = body.code?.trim() ?? "";
  if (!/^\d{15,20}$/.test(discordId) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (!env.guildId) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const db = getSupabaseAdmin();

  const { data: login, error: loginErr } = await db
    .from("berlin_roleplay_dashboard_logins")
    .select("id, code, discord_id, status, expires_at")
    .eq("discord_id", discordId)
    .eq("code", code)
    .maybeSingle();

  if (loginErr) {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  if (!login) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (!["pending", "sent"].includes(login.status)) {
    return NextResponse.json({ error: "already_used" }, { status: 401 });
  }
  if (new Date(login.expires_at) <= new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 401 });
  }

  const { data: member } = await db
    .from("berlin_roleplay_guild_members")
    .select("role")
    .eq("guild_id", env.guildId)
    .eq("user_id", discordId)
    .maybeSingle();

  if (!member || !["staff", "admin"].includes(member.role)) {
    await db
      .from("berlin_roleplay_dashboard_logins")
      .update({ status: "expired" })
      .eq("id", login.id);
    return NextResponse.json({ error: "access_denied" }, { status: 403 });
  }

  const { data: existing } = await db
    .from("berlin_roleplay_users")
    .select("id")
    .eq("id", discordId)
    .maybeSingle();

  if (!existing) {
    await db
      .from("berlin_roleplay_users")
      .insert({ id: discordId, username: discordId });
  }

  const token = await createSession(discordId, env.guildId);
  await db
    .from("berlin_roleplay_dashboard_logins")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", login.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
