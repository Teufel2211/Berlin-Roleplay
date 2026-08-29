const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('cases')
  .setDescription('Zeigt die letzten Moderations-Fälle')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addIntegerOption((o) => o.setName('limit').setDescription('Anzahl der Fälle (Standard: 10)').setMinValue(1).setMaxValue(50));

async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ embeds: [embeds.error('Nur auf Servern', 'Dieser Befehl kann nur auf einem Discord-Server verwendet werden.', interaction.guild)], flags: 64 });
  }
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;
  if (!hasModeratorAccess(member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du hast keine Berechtigung, diesen Befehl zu verwenden.', guild)], flags: 64 });
  }

  try {
    const limit = interaction.options.getInteger('limit') || 10;
    const cases = await moderationService.getCases(gid, limit);

    if (!cases.length) {
      return interaction.reply({ embeds: [embeds.info('Keine Fälle', 'Es gibt keine Moderations-Fälle.', guild)], flags: 64 });
    }

    const lines = cases.map((c) => {
      const date = new Date(c.created_at).toLocaleDateString('de-DE');
      return `**#${c.id}** — \`${c.action}\` — <@${c.target_id}> — ${date}`;
    });

    return interaction.reply({
      embeds: [embeds.info('🛡️ Moderations-Fälle', lines.join('\n'), guild)],
      flags: 64,
    });
  } catch (err) {
    logger.error(`Cases-Befehl fehlgeschlagen: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 });
  }
}

module.exports = { data, execute };