const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/moderationService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');

async function logModeration(guild, action, target, moderator, reason, extra = '') {
  const channelId = await settingsService.get(guild.id, 'moderation_log_channel_id');
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embeds.info(`🛡️ Moderation: ${action}`, `**Mitglied:** <@${target.id}>\n**Moderator:** <@${moderator.id}>\n**Grund:** ${reason}${extra ? `\n${extra}` : ''}`, guild)] });
  } catch (_) {}
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderationsverwaltung')
    .addSubcommand((s) => s.setName('warn').setDescription('Verwarnt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true)).addIntegerOption((o) => o.setName('punkte').setDescription('Warnpunkte').setMinValue(1).setMaxValue(100)))
    .addSubcommand((s) => s.setName('timeout').setDescription('Timeout für ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('minuten').setDescription('Dauer in Minuten').setMinValue(1).setMaxValue(10080)).addStringOption((o) => o.setName('grund').setDescription('Grund')))
    .addSubcommand((s) => s.setName('kick').setDescription('Kickt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund')))
    .addSubcommand((s) => s.setName('ban').setDescription('Bannt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund')))
    .addSubcommand((s) => s.setName('history').setDescription('Zeigt Warnungen eines Mitglieds').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true))),
  async execute(interaction) {
    const perms = interaction.member.permissions;
    if (!perms.has(PermissionFlagsBits.ModerateMembers) && !perms.has(PermissionFlagsBits.KickMembers) && !perms.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du besitzt keine Moderationsberechtigung.', interaction.guild)], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('mitglied');
    const guild = interaction.guild;

    if (sub === 'history') {
      const warnings = await moderationService.getWarnings(guild.id, target.id);
      const total = warnings.reduce((sum, w) => sum + Number(w.points || 0), 0);
      const lines = warnings.slice(0, 15).map((w, i) => `**${i + 1}.** ${w.points} P — ${w.reason || 'Kein Grund'}${w.expires_at ? ` — bis ${new Date(w.expires_at).toLocaleString('de-DE')}` : ''}`);
      return interaction.reply({ embeds: [embeds.info(`Warnhistorie: ${target.username}`, `**Gesamtpunkte:** ${total}\n\n${lines.length ? lines.join('\n') : 'Keine Verwarnungen vorhanden.'}`, guild)], ephemeral: true });
    }

    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    if (sub === 'warn') {
      const points = interaction.options.getInteger('punkte') || 1;
      await moderationService.warn(guild.id, target.id, interaction.user.id, reason, points);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'warn', reason);
      await logModeration(guild, 'Warn', target, interaction.user, reason, `**Punkte:** ${points}`);
      return interaction.reply({ embeds: [embeds.success('Verwarnung', `<@${target.id}> wurde mit **${points}** Warnpunkt(en) verwarnt.\nGrund: ${reason}`, guild)], ephemeral: true });
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Das Mitglied ist nicht auf dem Server.', guild)], ephemeral: true });

    if (sub === 'timeout') {
      const minutes = interaction.options.getInteger('minuten') || 10;
      await member.timeout(minutes * 60 * 1000, reason);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'timeout', reason, minutes * 60);
      await logModeration(guild, 'Timeout', target, interaction.user, reason, `**Dauer:** ${minutes} Minuten`);
      return interaction.reply({ embeds: [embeds.success('Timeout', `<@${target.id}> erhielt einen Timeout für **${minutes} Minuten**.`, guild)], ephemeral: true });
    }
    if (sub === 'kick') {
      await member.kick(reason);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'kick', reason);
      await logModeration(guild, 'Kick', target, interaction.user, reason);
      return interaction.reply({ embeds: [embeds.success('Kick', `<@${target.id}> wurde gekickt.`, guild)], ephemeral: true });
    }
    if (sub === 'ban') {
      await member.ban({ reason });
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'ban', reason);
      await logModeration(guild, 'Ban', target, interaction.user, reason);
      return interaction.reply({ embeds: [embeds.success('Ban', `<@${target.id}> wurde gebannt.`, guild)], ephemeral: true });
    }
  },
};