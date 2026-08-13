const { SlashCommandBuilder } = require('discord.js');
const ticketService = require('../services/ticketService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket-Support')
    .addSubcommand((s) => s.setName('panel').setDescription('Postet das Ticket-Panel'))
    .addSubcommand((s) => s.setName('claim').setDescription('Übernimmt dieses Ticket'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('Gibt dieses Ticket wieder frei'))
    .addSubcommand((s) => s.setName('schließen').setDescription('Schließt dieses Ticket sofort'))
    .addSubcommand((s) => s.setName('hinzufügen').setDescription('Fügt jemanden zum Ticket hinzu').addUserOption((o) => o.setName('user').setDescription('Benutzer').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll();
    const guild = interaction.guild;
    const staff = helpers.isGuildModerator(interaction.member, settings);

    if (sub === 'panel') {
      if (!helpers.isGuildAdmin(interaction.member, settings)) {
        return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Admin kann das Panel posten.', guild)], ephemeral: true });
      }
      return ticketService.postPanel(interaction);
    }
    if (!staff) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Tickets verwalten.', guild)], ephemeral: true });
    }
    if (sub === 'claim') return ticketService.claim(interaction);
    if (sub === 'unclaim') return ticketService.unclaim(interaction);
    if (sub === 'schließen') return ticketService.closeCommand(interaction);
    if (sub === 'hinzufügen') return ticketService.addUser(interaction, interaction.options.getUser('user'));
  },
};
