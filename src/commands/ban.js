const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const { hasModeratorAccess, logModeration, parseDuration, formatDuration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Bannt einen Nutzer vom Server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Zu bannender Nutzer').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für den Ban'))
  .addStringOption((o) => o.setName('dauer').setDescription('Ban-Dauer (z.B. 7d, 30d). Leer = permanent'))
  .addIntegerOption((o) => o.setName('nachrichten').setDescription('Nachrichten löschen (0-7 Tage, Standard: 0)').setMinValue(0).setMaxValue(7));

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
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    const durationStr = interaction.options.getString('dauer');
    const delDays = interaction.options.getInteger('nachrichten') || 0;
    const duration = parseDuration(durationStr);

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (targetMember) {
      if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
        return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang bannen.', guild)], flags: 64 });
      }
      if (!targetMember.bannable) {
        return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden (fehlende Berechtigungen?).', guild)], flags: 64 });
      }
    }

    await interaction.deferReply();

    try {
      const banMsg = 'Du wurdest von **' + guild.name + '** gebannt.\n**Grund:** ' + reason + (duration ? '\n**Dauer:** ' + formatDuration(duration) : '\n**Dauer:** Permanent');
      await target.send({ embeds: [embeds.warning('🔨 Gebannt', banMsg, guild)] }).catch(() => {});
    } catch (_) {}

    await guild.members.ban(target, { deleteMessageSeconds: delDays * 86400, reason: `${reason} (von ${interaction.user.tag})` });
    await logModeration(guild, interaction.user, 'ban', target, reason, { duration });

    const durationText = duration ? `\n**Dauer:** ${formatDuration(duration)}` : '';
    return interaction.editReply({ embeds: [embeds.success('🔨 Gebannt', `<@${target.id}> wurde vom Server gebannt.\n**Grund:** ${reason}${durationText}`, guild)] });
  } catch (err) {
    logger.error(`Ban-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };