const { SlashCommandBuilder } = require('discord.js');
const verifyService = require('../services/verifyService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verifizierungs-Panel und Status')
    .addSubcommand((s) => s.setName('panel').setDescription('Postet das Verifizierungs-Panel'))
    .addSubcommand((s) => s.setName('status').setDescription('Zeigt deinen Verifizierungsstatus'))
    .addSubcommand((s) =>
      s.setName('entfernen').setDescription('Entfernt die Verifizierung eines Mitglieds').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll(interaction.guild.id);
    const guild = interaction.guild;

    if (sub === 'panel') {
      if (!helpers.isGuildAdmin(interaction.member, settings)) {
        return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Admin kann das Panel posten.', guild)], ephemeral: true });
      }
      return verifyService.postPanel(interaction);
    }
    if (sub === 'status') return verifyService.status(interaction);
    if (sub === 'entfernen') {
      if (!helpers.isGuildModerator(interaction.member, settings)) {
        return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Verifizierungen entfernen.', guild)], ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      const member = interaction.guild.members.cache.get(target.id);
      return verifyService.remove(interaction, member || target);
    }
  },
};
