import {
  Client,
  Events,
  GatewayIntentBits,
  type ClientOptions,
} from "discord.js";

/** Intents lt. Spec §4: Guilds, GuildMembers, GuildMessages, MessageContent, GuildModeration. */
export const BOT_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration,
] as const;

export function createClient(options: Partial<ClientOptions> = {}): Client {
  return new Client({
    intents: BOT_INTENTS,
    ...options,
  });
}

export { Events };