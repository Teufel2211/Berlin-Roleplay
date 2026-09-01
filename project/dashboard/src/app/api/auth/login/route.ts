import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth";

export async function GET(request: Request) {
  if (!env.discordClientId) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 500 });
  }

  const host = new URL(request.url).host;
  const canonicalHost = new URL(env.appBaseUrl).host;
  if (host !== canonicalHost) {
    return NextResponse.redirect(`${env.appBaseUrl}/login`);
  }

  const state = randomBytes(32).toString("hex");
  const params = new URLSearchParams({
    client_id: env.discordClientId,
    redirect_uri: env.discordRedirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "consent",
  });

  const res = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.appBaseUrl.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
