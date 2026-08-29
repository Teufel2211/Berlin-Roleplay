const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const { hasModeratorAccess, logModeration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Bannt + entbannt einen Nutzer (löscht seine Nachrichten)')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Zu softbannender Nutzer').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für den Softban'))
  .addIntegerOption((o) => o.setName('nachrichten').setDescription('Nachrichten löschen (0-7 Tage, Standard: 7)').setMinValue(0).setMaxValue(7));

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
    const delDays = interaction.options.getInteger('nachrichten') ?? 7;

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (targetMember) {
      if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
        return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang softbannen.', guild)], flags: 64 });
      }
      if (!targetMember.bannable) {
        return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden.', guild)], flags: 64 });
      }
    }

    await interaction.deferReply();

    try {
      await target.send({ embeds: [embeds.warning('🌀 Softban', `Du wurdest von **${guild.name}** gesoftbannet (Ban + Entbannt).\n**Grund:** ${reason}`, guild)] }).catch(() => {});
    } catch (_) {}

    await guild.members.ban(target, { deleteMessageSeconds: delDays * 86400, reason: `Softban: ${reason} (von ${interaction.user.tag})` });
    await guild.members.unban(target.id, 'Softban: automatische Entbannt');
    await logModeration(guild, interaction.user, 'softban', target, reason);

    return interaction.editReply({ embeds: [embeds.success('🌀 Softban', `<@${target.id}> wurde gesoftbannet.\nNachrichten der letzten **${delDays} Tage** wurden gelöscht.\n**Grund:** ${reason}`, guild)] });
  } catch (err) {
    logger.error(`Softban-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };