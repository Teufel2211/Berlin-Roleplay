const { SlashCommandBuilder } = require('discord.js');
const giveawayService = require('../services/giveawayService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway-Verwaltung')
    .addSubcommand((s) => s
      .setName('create')
      .setDescription('Erstellt ein Giveaway')
      .addStringOption((o) => o.setName('name').setDescription('Name des Giveaways').setRequired(true))
      .addStringOption((o) => o.setName('länge').setDescription('z.B. 30m, 2h, 3d').setRequired(true))
      .addIntegerOption((o) => o.setName('gewinner').setDescription('Anzahl der Gewinner').setMinValue(1).setRequired(true))
      .addStringOption((o) => o.setName('extra_entries').setDescription('Rollen mit Bonus-Losen, z.B. @VIP:2,@Team:3'))
      .addStringOption((o) => o.setName('requirements').setDescription('Voraussetzungen, z.B. @Verifiziert + Account 30 Tage'))
    )
    .addSubcommand((s) => s
      .setName('end')
      .setDescription('Beendet ein Giveaway')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
    )
    .addSubcommand((s) => s
      .setName('reroll')
      .setDescription('Zieht Gewinner neu')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
      .addIntegerOption((o) => o.setName('anzahl').setDescription('Wie viele Gewinner neu gezogen werden').setMinValue(1).setRequired(true))
      .addBooleanOption((o) => o.setName('sieger_behalten').setDescription('Bereits gezogene Sieger behalten'))
    ),
  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ embeds: [embeds.error('Nur auf einem Server', 'Dieser Command funktioniert nur auf einem Discord-Server.', interaction.guild)], ephemeral: true });
    if (!helpers.isGuildModerator(interaction.member, {})) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du darfst keine Giveaways verwalten.', interaction.guild)], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return giveawayService.createGiveaway(interaction, {
      name: interaction.options.getString('name'),
      duration: interaction.options.getString('länge'),
      winners: interaction.options.getInteger('gewinner'),
      extraEntries: interaction.options.getString('extra_entries') || '',
      requirements: interaction.options.getString('requirements') || '',
    });
    if (sub === 'end') return giveawayService.endNow(interaction, interaction.options.getString('id'));
    return giveawayService.reroll(interaction, interaction.options.getString('id'), interaction.options.getInteger('anzahl'), interaction.options.getBoolean('sieger_behalten') !== false);
  },
};
