const { REST, Routes } = require('discord.js');
const { config } = require('../config');
const logger = require('../logger');
const commands = require('../commands');

function commandData() {
  return commands.map((c) => c.data.toJSON());
}

async function registerCommands() {
  if (!config.discordToken || !config.clientId || !config.guildId) {
    throw new Error('DISCORD_TOKEN, CLIENT_ID und GUILD_ID müssen in .env stehen (npm run deploy)');
  }
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = commandData();
  logger.info(`Registriere ${body.length} Slash-Kommandos...`);
  const data = await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  logger.info(`Erfolgreich registriert: ${data.length} Kommandos`);
  return data;
}

module.exports = { registerCommands, commandData, commands };
