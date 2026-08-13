const { SlashCommandBuilder } = require('discord.js');
const applicationService = require('../services/applicationService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bewerbung')
    .setDescription('Bewerbungen einreichen und verwalten')
    .addStringOption((o) =>
      o.setName('art').setDescription('Wofür willst du dich bewerben?').setRequired(true).addChoices(
        ...applicationService.APPLICATION_TYPES.map((t) => ({ name: t, value: t }))
      )
    )
    .addSubcommand((s) => s.setName('schließen').setDescription('Schließt einen Bewerbungs-Kanal').addStringOption((o) => o.setName('channel-id').setDescription('Kanal-ID').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Zeigt offene Bewerbungen')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll();
    const guild = interaction.guild;

    if (!sub) {
      const art = interaction.options.getString('art');
      return applicationService.open(interaction, art);
    }
    if (sub === 'liste') return applicationService.list(interaction);

    if (!helpers.isGuildModerator(interaction.member, settings)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Bewerbungen schließen.', guild)], ephemeral: true });
    }
    if (sub === 'schließen') {
      return applicationService.close(interaction, interaction.options.getString('channel-id'));
    }
  },
};
