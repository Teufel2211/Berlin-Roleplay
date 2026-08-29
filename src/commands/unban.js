const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const { hasModeratorAccess, logModeration } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Hebt den Ban eines Nutzers auf')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption((o) => o.setName('nutzer-id').setDescription('ID des gebannten Nutzers').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für die Aufhebung'));

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
    const targetId = interaction.options.getString('nutzer-id');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

    await interaction.deferReply();

    let target;
    try {
      target = await guild.bans.fetch(targetId);
    } catch (_) {
      return interaction.editReply({ embeds: [embeds.error('Nicht gebannt', 'Dieser Nutzer ist nicht gebannt.', guild)] });
    }

    await guild.members.unban(targetId, `${reason} (von ${interaction.user.tag})`);
    const user = target.user || { id: targetId, tag: targetId };
    await logModeration(guild, interaction.user, 'unban', user, reason);

    return interaction.editReply({ embeds: [embeds.success('✅ Entbannt', `<@${targetId}> wurde entbannt.\n**Grund:** ${reason}`, guild)] });
  } catch (err) {
    logger.error(`Unban-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.editReply(reply);
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };