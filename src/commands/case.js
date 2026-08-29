const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess, formatDuration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('Zeigt Details eines bestimmten Falls')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addIntegerOption((o) => o.setName('id').setDescription('Fall-ID').setRequired(true));

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
    const cases = await moderationService.getCases(gid, 500);
    const c = cases.find((x) => x.id === id);

    if (!c) {
      return interaction.reply({ embeds: [embeds.error('Nicht gefunden', `Fall #${id} wurde nicht gefunden.`, guild)], flags: 64 });
    }

    const date = new Date(c.created_at).toLocaleString('de-DE');
    const fields = [
      `**Aktion:** ${c.action}`,
      `**Nutzer:** <@${c.target_id}>`,
      `**Moderator:** <@${c.moderator_id}>`,
      `**Grund:** ${c.reason || 'Kein Grund angegeben'}`,
      `**Datum:** ${date}`,
    ];
    if (c.duration_seconds) fields.push(`**Dauer:** ${formatDuration(c.duration_seconds)}`);

    return interaction.reply({
      embeds: [embeds.info(`🛡️ Fall #${c.id}`, fields.join('\n'), guild)],
      flags: 64,
    });
  } catch (err) {
    logger.error(`Case-Befehl fehlgeschlagen: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 });
  }
}

module.exports = { data, execute };