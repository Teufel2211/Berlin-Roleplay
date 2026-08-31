import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  if (!env.discordClientId) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    redirect_uri: env.discordRedirectUri,
    response_type: "code",
    scope: "identify guilds",
    prompt: "none",
  });

  const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
