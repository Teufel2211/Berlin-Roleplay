const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { config } = require('../config');
const logger = require('../logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

let guildRefreshTimer = null;

async function refreshGuildCache() {
  if (!client.isReady()) return;
  try {
    // Explicitly refresh the guild cache so the dashboard can reliably
    // determine whether the bot is installed in a specific server.
    await client.guilds.fetch();
  } catch (err) {
    logger.warn(`Discord-Guild-Cache konnte nicht aktualisiert werden: ${err.message}`);
  }
}

async function login() {
  if (!config.discordToken) {
    throw new Error('DISCORD_TOKEN fehlt in .env');
  }
  await client.login(config.discordToken);
  await refreshGuildCache();

  if (!guildRefreshTimer) {
    guildRefreshTimer = setInterval(() => {
      refreshGuildCache().catch((err) => logger.warn(`Guild-Refresh fehlgeschlagen: ${err.message}`));
    }, 30_000);
    guildRefreshTimer.unref?.();
  }
}

module.exports = { client, login, refreshGuildCache };
