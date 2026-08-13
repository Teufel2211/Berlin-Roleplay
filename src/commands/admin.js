const { SlashCommandBuilder } = require('discord.js');
const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const verifyService = require('../services/verifyService');
const ticketService = require('../services/ticketService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const { config } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administration')
    .addSubcommand((s) => s.setName('setup').setDescription('Postet Verifizierungs- und Ticket-Panel'))
    .addSubcommand((s) => s.setName('rollen').setDescription('Zeigt die konfigurierten Rollen'))
    .addSubcommand((s) => s.setName('dashboard').setDescription('Zeigt die Dashboard-URL')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll();
    const guild = interaction.guild;
    if (!helpers.isGuildAdmin(interaction.member, settings)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Admin kann diesen Befehl nutzen.', guild)], ephemeral: true });
    }

    if (sub === 'dashboard') {
      return interaction.reply({
        embeds: [embeds.info('Dashboard', `Das Dashboard erreichst du unter:\n${config.webUrl}/dashboard`, guild)],
        ephemeral: true,
      });
    }
    if (sub === 'rollen') {
      const lines = [
        `👮 **Staff:** ${settings.staff_role || 'nicht gesetzt'}`,
        `🛡️ **Admin:** ${settings.admin_role || 'nicht gesetzt'}`,
        `✅ **Verifiziert:** ${settings.verified_role || 'nicht gesetzt'}`,
        `🎧 **Warteraum:** ${settings.warteraum_role || 'nicht gesetzt'}`,
      ];
      return interaction.reply({ embeds: [embeds.info('Konfigurierte Rollen', lines.join('\n'), guild)], ephemeral: true });
    }
    if (sub === 'setup') {
      await auditService.log(interaction.user.tag, 'admin.setup', {});
      const messages = [];
      if (settings.verify_channel_id) {
        await verifyService.postPanel(interaction);
        messages.push('Verifizierungs-Panel gepostet');
      } else {
        messages.push('⚠️ `verify_channel_id` nicht gesetzt – kein Verifizierungs-Panel');
      }
      if (settings.ticket_panel_channel_id) {
        await ticketService.postPanel(interaction);
        messages.push('Ticket-Panel gepostet');
      } else {
        messages.push('⚠️ `ticket_panel_channel_id` nicht gesetzt – kein Ticket-Panel');
      }
      return interaction.reply({ embeds: [embeds.info('Setup abgeschlossen', messages.join('\n'), guild)], ephemeral: true });
    }
  },
};
