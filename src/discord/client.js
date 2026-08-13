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

async function login() {
  if (!config.discordToken) {
    throw new Error('DISCORD_TOKEN fehlt in .env');
  }
  await client.login(config.discordToken);
}

module.exports = { client, login };
