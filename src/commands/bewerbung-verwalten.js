const { SlashCommandBuilder } = require('discord.js');
const applicationService = require('../services/applicationService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bewerbung-verwalten')
    .setDescription('Bewerbungen verwalten (Staff)')
    .addSubcommand((s) => s.setName('liste').setDescription('Zeigt offene Bewerbungen'))
    .addSubcommand((s) =>
      s
        .setName('schließen')
        .setDescription('Schließt einen Bewerbungs-Kanal')
        .addStringOption((o) => o.setName('channel-id').setDescription('Kanal-ID').setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'liste') return applicationService.list(interaction);

    const settings = await settingsService.getAll();
    if (!helpers.isGuildModerator(interaction.member, settings)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Bewerbungen schließen.', guild)], ephemeral: true });
    }
    if (sub === 'schließen') {
      return applicationService.close(interaction, interaction.options.getString('channel-id'));
    }
  },
};
