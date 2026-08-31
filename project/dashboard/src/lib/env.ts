export const env = {
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordRedirectUri:
    process.env.DISCORD_REDIRECT_URI ??
    "http://localhost:3000/api/auth/callback",
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  sessionSecret:
    process.env.SESSION_SECRET ?? "dev-secret-change-me-in-production",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
};

export function isAuthConfigured(): boolean {
  return Boolean(
    env.discordClientId &&
      env.discordClientSecret &&
      env.supabaseUrl &&
      env.supabaseServiceKey
  );
}
