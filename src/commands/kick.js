const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const { hasModeratorAccess, logModeration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kickt einen Nutzer vom Server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Zu kickender Nutzer').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für den Kick'));

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

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Dieser Nutzer ist nicht auf dem Server.', guild)], flags: 64 });
    }
    if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
      return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang kicken.', guild)], flags: 64 });
    }
    if (!targetMember.kickable) {
      return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gekickt werden.', guild)], flags: 64 });
    }

    await interaction.deferReply();

    try {
      await target.send({ embeds: [embeds.warning('👢 Gekickt', `Du wurdest von **${guild.name}** gekickt.\n**Grund:** ${reason}`, guild)] }).catch(() => {});
    } catch (_) {}

    await targetMember.kick(`${reason} (von ${interaction.user.tag})`);
    await logModeration(guild, interaction.user, 'kick', target, reason);

    return interaction.editReply({ embeds: [embeds.success('👢 Gekickt', `<@${target.id}> wurde vom Server gekickt.\n**Grund:** ${reason}`, guild)] });
  } catch (err) {
    logger.error(`Kick-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };