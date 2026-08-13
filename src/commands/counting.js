const { SlashCommandBuilder } = require('discord.js');
const countingService = require('../services/countingService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Counting-Modul')
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Top 10 der fleißigsten Zähler'))
    .addSubcommand((s) => s.setName('stats').setDescription('Zähl-Statistiken').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('set').setDescription('Setzt den Zählerstand manuell').addIntegerOption((o) => o.setName('zahl').setDescription('Neuer Zählerstand').setRequired(true)))
    .addSubcommand((s) => s.setName('ziel').setDescription('Zielzahl setzen oder entfernen').addIntegerOption((o) => o.setName('zahl').setDescription('Zielzahl')))
    .addSubcommand((s) => s.setName('reset').setDescription('Setzt den Zähler zurück')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll();
    const guild = interaction.guild;
    const admin = helpers.isGuildAdmin(interaction.member, settings);

    if (sub === 'leaderboard') return countingService.leaderboard(interaction);
    if (sub === 'stats') return countingService.stats(interaction, interaction.options.getMember('user'));

    if (!admin) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Admin kann den Zähler verwalten.', guild)], ephemeral: true });
    }
    if (sub === 'set') return countingService.setNumber(interaction, interaction.options.getInteger('zahl'));
    if (sub === 'ziel') {
      const zahl = interaction.options.getInteger('zahl');
      if (zahl === null) return countingService.clearTarget(interaction);
      return countingService.setTarget(interaction, zahl);
    }
    if (sub === 'reset') return countingService.reset(interaction);
  },
};
