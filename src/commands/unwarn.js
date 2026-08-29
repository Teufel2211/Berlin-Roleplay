const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/moderationService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('unwarn')
  .setDescription('Entfernt eine Verwarnung von einem Nutzer')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer, dessen Verwarnung entfernt wird').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für die Entfernung'))
  .addBooleanOption((o) => o.setName('alle').setDescription('Alle Verwarnungen entfernen (Standard: nur die neueste)'));

async function logModeration(guild, moderator, target, reason, removed) {
  try {
    await moderationService.logCase(guild.id, target.id, moderator.id, 'unwarn', reason);
    const logChannelId = await settingsService.get(guild.id, 'moderation_log_channel_id');
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    const embed = embeds.v2({
      color: embeds.COLORS.info,
      title: '🧹 Unwarn',
      description: `**Nutzer:** <@${target.id}> (${target.tag || target.id})\n**Moderator:** <@${moderator.id}>\n**Grund:** ${reason}\n**Entfernt:** ${removed}`,
      guild,
    });
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Moderations-Log fehlgeschlagen: ${err.message}`);
  }
}

async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ embeds: [embeds.error('Nur auf Servern', 'Dieser Befehl kann nur auf einem Discord-Server verwendet werden.', interaction.guild)], flags: 64 });
  }

  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;

  if (!helpers.isGuildAdmin(member, settings) && !helpers.isGuildModerator(member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du hast keine Berechtigung, diesen Befehl zu verwenden.', guild)], flags: 64 });
  }

  const target = interaction.options.getUser('nutzer');
  const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
  const removeAll = interaction.options.getBoolean('alle') || false;

  if (target.bot) {
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Bots haben keine Verwarnungen.', guild)], flags: 64 });
  }

  await interaction.deferReply();

  const warnings = await moderationService.getWarnings(gid, target.id);
  if (!warnings.length) {
    return interaction.editReply({ embeds: [embeds.info('Keine Verwarnungen', `<@${target.id}> hat keine Verwarnungen.`, guild)] });
  }

  const toRemove = removeAll ? warnings : [warnings[0]];
  const removedPoints = toRemove.reduce((sum, w) => sum + (w.points || 1), 0);
  for (const w of toRemove) {
    await moderationService.deleteWarning(gid, w.id);
  }

  const scope = removeAll ? `${warnings.length} Verwarnungen` : `Verwarnung #${warnings[0].id}`;
  await logModeration(guild, interaction.user, target, reason, `${scope} (-${removedPoints} Punkt(e))`);

  const remaining = await moderationService.getWarningCount(gid, target.id);
  return interaction.editReply({ embeds: [embeds.success('🧹 Unwarn', `<@${target.id}>: ${scope} entfernt.\n**Grund:** ${reason}\n**Entfernte Punkte:** -${removedPoints}\n**Verbleibende Punkte:** ${remaining}`, guild)] });
}

module.exports = { data, execute };