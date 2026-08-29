const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess, logModeration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Verwarnt einen Nutzer')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Zu verwarnender Nutzer').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund der Verwarnung').setRequired(true))
  .addIntegerOption((o) => o.setName('punkte').setDescription('Warn-Punkte (Standard: 1)').setMinValue(1).setMaxValue(100));

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
    const target = interaction.options.getUser('nutzer');
    const reason = interaction.options.getString('grund');
    const points = interaction.options.getInteger('punkte') || 1;

    if (target.bot) {
      return interaction.reply({ embeds: [embeds.error('Fehler', 'Bots können nicht verwarnt werden.', guild)], flags: 64 });
    }

    await interaction.deferReply();

    await moderationService.warn(gid, target.id, interaction.user.id, reason, points);
    const totalPoints = await moderationService.getWarningCount(gid, target.id);
    await logModeration(guild, interaction.user, 'warn', target, reason);

    try {
      await target.send({ embeds: [embeds.warning('⚠️ Verwarnung', `Du wurdest auf **${guild.name}** verwarnet.\n**Grund:** ${reason}\n**Punkte:** +${points} (Gesamt: ${totalPoints})`, guild)] }).catch(() => {});
    } catch (_) {}

    return interaction.editReply({ embeds: [embeds.success('⚠️ Verwarnung', `<@${target.id}> wurde verwarnet.\n**Grund:** ${reason}\n**Punkte:** +${points}\n**Gesamtpunkte:** ${totalPoints}`, guild)] });
  } catch (err) {
    logger.error(`Warn-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };