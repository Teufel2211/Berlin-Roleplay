const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const { hasModeratorAccess } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Postet das Moderations-Panel in einen Kanal')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addChannelOption((o) => o.setName('kanal').setDescription('Ziel-Kanal').setRequired(true));

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
    const channel = interaction.options.getChannel('kanal');
    if (!channel.isTextBased()) {
      return interaction.reply({ embeds: [embeds.error('Fehler', 'Der Kanal muss ein Textkanal sein.', guild)], flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const moderationPanelService = require('../services/moderationPanelService');
    const msgId = await moderationPanelService.postPanel(guild, channel.id, interaction.user.tag);
    return interaction.editReply({ embeds: [embeds.success('🛡️ Panel gesendet', `Panel wurde in <#${channel.id}> gesendet.\nNachricht: \`${msgId}\``, guild)] });
  } catch (err) {
    logger.error(`Panel-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };