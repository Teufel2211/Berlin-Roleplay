export const env = {
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordRedirectUri:
    process.env.DISCORD_REDIRECT_URI ??
    `${resolveAppBaseUrl()}/api/auth/callback`,
  appBaseUrl: resolveAppBaseUrl(),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  sessionSecret:
    process.env.SESSION_SECRET ?? "dev-secret-change-me-in-production",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
};

function resolveAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) return `https://${productionUrl}`;

  const deploymentUrl = process.env.VERCEL_URL?.trim();
  if (deploymentUrl) return `https://${deploymentUrl}`;

  return "http://localhost:3000";
}

export function isAuthConfigured(): boolean {
  return Boolean(
    env.discordClientId &&
      env.discordClientSecret &&
      env.supabaseUrl &&
      env.supabaseServiceKey
  );
}
