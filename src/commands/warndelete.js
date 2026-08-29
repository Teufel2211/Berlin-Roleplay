const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('warndelete')
  .setDescription('Löscht eine Verwarnung')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addIntegerOption((o) => o.setName('id').setDescription('ID der Verwarnung').setRequired(true));

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
    const id = interaction.options.getInteger('id');
    const warning = await moderationService.getWarningById(gid, id);

    if (!warning) {
      return interaction.reply({ embeds: [embeds.error('Nicht gefunden', `Verwarnung #${id} wurde nicht gefunden.`, guild)], flags: 64 });
    }

    await moderationService.deleteWarning(gid, id);
    return interaction.reply({ embeds: [embeds.success('Verwarnung gelöscht', `Verwarnung #${id} von <@${warning.target_id}> wurde gelöscht.`, guild)], flags: 64 });
  } catch (err) {
    logger.error(`Warndelete-Befehl fehlgeschlagen: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 });
  }
}

module.exports = { data, execute };