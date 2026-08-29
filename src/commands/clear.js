const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess, logModeration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Löscht Nachrichten aus dem Kanal')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addIntegerOption((o) => o.setName('anzahl').setDescription('Anzahl der Nachrichten (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
  .addUserOption((o) => o.setName('nutzer').setDescription('Nur Nachrichten dieses Nutzers'));

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
    const amount = interaction.options.getInteger('anzahl');
    const targetUser = interaction.options.getUser('nutzer');

    if (!interaction.channel.isTextBased()) {
      return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Befehl kann nur in Textkanälen verwendet werden.', guild)], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let deleted = 0;
    if (targetUser) {
      let remaining = amount;
      while (remaining > 0) {
        const batch = Math.min(remaining, 100);
        const fetched = await interaction.channel.messages.fetch({ limit: batch });
        if (fetched.size === 0) break;
        const filtered = fetched.filter((m) => m.author.id === targetUser.id);
        if (filtered.size === 0) break;
        const deletedMsgs = await interaction.channel.bulkDelete(filtered, true);
        deleted += deletedMsgs.size;
        remaining -= fetched.size;
      }
    } else {
      deleted = await moderationService.clearMessages(interaction.channel, amount);
    }

    await logModeration(guild, interaction.user, 'clear', { id: interaction.user.id, tag: interaction.user.tag }, `${targetUser ? `<@${targetUser.id}>: ` : ''}${deleted} Nachrichten gelöscht`, { count: deleted });

    return interaction.editReply({ embeds: [embeds.success('🗑️ Gelöscht', `${deleted} Nachrichten wurden gelöscht.${targetUser ? ` (Nur von <@${targetUser.id}>)` : ''}`, guild)] });
  } catch (err) {
    logger.error(`Clear-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };