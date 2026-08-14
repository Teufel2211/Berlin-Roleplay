const { SlashCommandBuilder } = require('discord.js');
const giveawayService = require('../services/giveawayService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway-Verwaltung')
    .addSubcommand((s) =>
      s
        .setName('starten')
        .setDescription('Startet ein Giveaway')
        .addStringOption((o) => o.setName('preis').setDescription('Was gibt es zu gewinnen?').setRequired(true))
        .addStringOption((o) => o.setName('dauer').setDescription('z.B. 30m, 1h, 2d').setRequired(true))
        .addIntegerOption((o) => o.setName('gewinner').setDescription('Anzahl Gewinner (Standard aus Einstellungen)'))
    )
    .addSubcommand((s) => s.setName('enden').setDescription('Beendet ein Giveaway vorzeitig').addStringOption((o) => o.setName('giveaway-id').setDescription('ID aus /giveaway liste').setRequired(true)))
    .addSubcommand((s) => s.setName('verlängern').setDescription('Verlängert die Endzeit').addStringOption((o) => o.setName('giveaway-id').setDescription('ID aus /giveaway liste').setRequired(true)).addStringOption((o) => o.setName('dauer').setDescription('z.B. 30m, 1h').setRequired(true)))
    .addSubcommand((s) => s.setName('neu').setDescription('Zieht Gewinner neu (nur beendete)').addStringOption((o) => o.setName('giveaway-id').setDescription('ID aus /giveaway liste').setRequired(true)))
    .addSubcommand((s) => s.setName('teilnehmer').setDescription('Zeigt die Teilnehmerliste').addStringOption((o) => o.setName('giveaway-id').setDescription('ID aus /giveaway liste').setRequired(true)))
    .addSubcommand((s) => s.setName('abbrechen').setDescription('Bricht ein Giveaway ab').addStringOption((o) => o.setName('giveaway-id').setDescription('ID aus /giveaway liste').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Zeigt laufende Giveaways')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsService.getAll(interaction.guild.id);
    const guild = interaction.guild;
    if (!helpers.isGuildModerator(interaction.member, settings)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Giveaways verwalten.', guild)], ephemeral: true });
    }

    if (sub === 'starten') {
      return giveawayService.createGiveaway(interaction, interaction.options.getString('preis'), interaction.options.getString('dauer'), interaction.options.getInteger('gewinner'));
    }
    const id = interaction.options.getString('giveaway-id');
    if (sub === 'enden') return giveawayService.endNow(interaction, id);
    if (sub === 'verlängern') return giveawayService.extend(interaction, id, interaction.options.getString('dauer'));
    if (sub === 'neu') return giveawayService.redraw(interaction, id);
    if (sub === 'teilnehmer') return giveawayService.participantsList(interaction, id);
    if (sub === 'abbrechen') return giveawayService.cancel(interaction, id);
    if (sub === 'liste') return giveawayService.list(interaction);
  },
};
