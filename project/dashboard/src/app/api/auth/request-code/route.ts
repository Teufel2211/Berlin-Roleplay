import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const LOGIN_CODE_TTL_SECONDS = 5 * 60; // 5 Minuten

export async function POST(request: Request) {
  let body: { discordId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const discordId = body.discordId?.trim();
  if (!discordId) {
    return NextResponse.json({ error: "missing_discord_id" }, { status: 400 });
  }
  if (!/^\d{15,20}$/.test(discordId)) {
    return NextResponse.json({ error: "invalid_discord_id" }, { status: 400 });
  }
  if (!env.guildId) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const db = getSupabaseAdmin();

  // Der Einlogger muss Staff/Admin der Guild sein, sonst kein Code erzeugen.
  const { data: member, error: memberErr } = await db
    .from("berlin_roleplay_guild_members")
    .select("role")
    .eq("guild_id", env.guildId)
    .eq("user_id", discordId)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  if (!member || !["staff", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "access_denied" }, { status: 403 });
  }

  // Alte, noch offene Logins dieser Discord-ID invalidieren.
  await db
    .from("berlin_roleplay_dashboard_logins")
    .update({ status: "expired" })
    .eq("discord_id", discordId)
    .in("status", ["pending", "sent"]);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_SECONDS * 1000).toISOString();

  const { error: insertErr } = await db
    .from("berlin_roleplay_dashboard_logins")
    .insert({ code, discord_id: discordId, status: "pending", expires_at: expiresAt });

  if (insertErr) {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
