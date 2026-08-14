const { SlashCommandBuilder } = require('discord.js');
const warteraumService = require('../services/warteraumService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warteraum')
    .setDescription('Warteraum-Voice-Queue')
    .addSubcommand((s) => s.setName('hinzufügen').setDescription('Reiht ein Mitglied ein').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Zeigt die Warteschlange'))
    .addSubcommand((s) => s.setName('raus').setDescription('Entfernt ein Mitglied aus der Queue').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('weiter').setDescription('Ruft den nächsten aus der Queue auf')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll(interaction.guild.id);
    const guild = interaction.guild;
    const staff = helpers.isGuildModerator(interaction.member, settings);

    if (sub === 'liste') return warteraumService.list(interaction);

    if (!staff) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann den Warteraum verwalten.', guild)], ephemeral: true });
    }
    if (sub === 'hinzufügen') {
      const member = interaction.options.getMember('user');
      if (!member) {
        return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Das Mitglied ist nicht im Server.', guild)], ephemeral: true });
      }
      return warteraumService.add(interaction, member);
    }
    if (sub === 'raus') {
      const member = interaction.options.getMember('user');
      if (!member) {
        return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Das Mitglied ist nicht im Server.', guild)], ephemeral: true });
      }
      return warteraumService.removeFromQueue(interaction, member);
    }
    if (sub === 'weiter') return warteraumService.advance(interaction);
  },
};
