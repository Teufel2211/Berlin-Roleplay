const { REST, Routes } = require('discord.js');
const { config } = require('../config');
const logger = require('../logger');
const commands = require('../commands');

function commandData() {
  const unique = new Map();
  for (const command of commands) {
    const data = command.data.toJSON();
    if (!data.name) continue;
    if (!unique.has(data.name)) unique.set(data.name, data);
    else logger.warn(`Doppeltes Slash-Kommando entfernt: /${data.name}`);
  }
  return [...unique.values()];
}

async function clearGuildCommands(rest) {
  if (!config.clientId || !config.discordToken) return;
  const res = await rest.get(Routes.userGuilds(config.clientId));
  const guilds = Array.isArray(res) ? res : [];

  for (const guild of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body: [] });
      logger.info(`Alte Guild-Kommandos entfernt: ${guild.name || guild.id}`);
    } catch (err) {
      logger.warn(`Guild-Kommandos für ${guild.id} konnten nicht entfernt werden: ${err.message}`);
    }
  }
}

async function registerCommands() {
  if (!config.discordToken || !config.clientId) {
    throw new Error('DISCORD_TOKEN und CLIENT_ID müssen in .env stehen (npm run deploy)');
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = commandData();

  // Remove legacy guild-scoped commands first. Otherwise Discord can show
  // the same command twice: once globally and once for the guild.
  await clearGuildCommands(rest);

  logger.info(`Registriere ${body.length} eindeutige Slash-Kommandos (global)...`);
  const data = await rest.put(Routes.applicationCommands(config.clientId), { body });
  logger.info(`Erfolgreich registriert: ${data.length} globale Kommandos`);
  return data;
}

module.exports = { registerCommands, commandData, commands, clearGuildCommands };
