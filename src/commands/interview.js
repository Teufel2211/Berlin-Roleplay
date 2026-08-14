const { SlashCommandBuilder, ChannelType } = require('discord.js');
const interviewService = require('../services/interviewService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const { config } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('interview')
    .setDescription('Interview-System')
    .addSubcommand((s) =>
      s
        .setName('starten')
        .setDescription('Startet ein Interview für einen Nutzer')
        .addUserOption((o) => o.setName('user').setDescription('Kandidat').setRequired(true))
        .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: konfigurierter Interview-Kanal)').addChannelTypes(ChannelType.GuildText))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const settings = await settingsService.getAll(guild.id);

    if (sub === 'starten') {
      const owner = interaction.member && interaction.member.id === config.ownerUserId;
      if (!owner && !helpers.isGuildModerator(interaction.member, settings)) {
        return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Interviews starten.', guild)], ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      const channel = interaction.options.getChannel('kanal');
      return interviewService.startInterview(interaction, target, channel);
    }
  },
};
