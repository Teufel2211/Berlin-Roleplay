/**
 * Bot-Konfiguration: zentraler Env-Zugriff + Pflicht-Secrets.
 * Nicht-Fehlender Env → Fehler beim Bootstrap.
 */

export interface BotConfig {
  discordToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  guildId: string | null;
  siteUrl: string;
  logLevel: string;
  webhookPort: number;
  erlcWebhookPublicKey: string | null;
}

const REQUIRED = ["DISCORD_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  for (const key of REQUIRED) {
    if (!env[key]) {
      throw new Error(`Fehlende Pflicht-Umgebungsvariable: ${key}`);
    }
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    supabaseUrl: env.SUPABASE_URL!,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    guildId: env.GUILD_ID ?? null,
    siteUrl: env.WEB_URL ?? "http://localhost:3000",
    logLevel: env.LOG_LEVEL ?? "info",
    webhookPort: Number(env.WEBHOOK_PORT ?? "8080"),
    erlcWebhookPublicKey: env.ERLC_WEBHOOK_PUBLIC_KEY?.trim() || null,
  };
}

/** Secrets (Keys/Token) aus Logs redigieren – nie im Klartext loggen. */
const SECRET_PATTERN =
  /(token|secret|key|password|authorization|server.?key|service.?role)(["'\s:=]+)([A-Za-z0-9._\-]{12,})/gi;

export function redact(text: string): string {
  return text.replace(SECRET_PATTERN, (_all, name, sep) => `${name}${sep}<redacted>`);
}