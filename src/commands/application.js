const { SlashCommandBuilder } = require('discord.js');
const applicationService = require('../services/applicationService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bewerbung')
    .setDescription('Bewerbungen einreichen')
    .addStringOption((o) =>
      o.setName('art').setDescription('Wofür willst du dich bewerben?').setRequired(true).addChoices(
        ...applicationService.APPLICATION_TYPES.map((t) => ({ name: t, value: t }))
      )
    ),
  async execute(interaction) {
    const art = interaction.options.getString('art');
    return applicationService.open(interaction, art);
  },
};
