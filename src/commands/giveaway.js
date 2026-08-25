const { SlashCommandBuilder } = require('discord.js');
const giveawayService = require('../services/giveawayService');
const embeds = require('../discord/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway-Verwaltung')
    .addSubcommand((s) => s
      .setName('create')
      .setDescription('Erstellt ein Giveaway')
      .addStringOption((o) => o.setName('name').setDescription('Name des Giveaways').setRequired(true))
      .addStringOption((o) => o.setName('dauer').setDescription('z.B. 30m, 2h, 3d').setRequired(true))
      .addIntegerOption((o) => o.setName('gewinner').setDescription('Anzahl der Gewinner').setMinValue(1).setRequired(true))
      .addStringOption((o) => o.setName('extra_entries').setDescription('Bonus-Lose: @Rolle:2,@Rolle:3'))
      .addStringOption((o) => o.setName('requirements').setDescription('Pflichtrollen/Anforderungen; Rollen erwähnen'))
    )
    .addSubcommand((s) => s
      .setName('edit')
      .setDescription('Bearbeitet ein aktives Giveaway')
      .addStringOption((o) => o.setName('id').setDescription('Aktives Giveaway auswählen').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('name').setDescription('Neuer Name / neues Prämi'))
      .addIntegerOption((o) => o.setName('gewinner').setDescription('Neue Anzahl Gewinner').setMinValue(1))
      .addStringOption((o) => o.setName('dauer').setDescription('Ende verschieben, z.B. +1h, +30m'))
      .addStringOption((o) => o.setName('extra_entries').setDescription('Neue Bonus-Lose: @Rolle:2,@Rolle:3'))
      .addStringOption((o) => o.setName('requirements').setDescription('Neue Pflichtrollen; Rollen erwähnen'))
    )
    .addSubcommand((s) => s
      .setName('end')
      .setDescription('Beendet ein Giveaway')
      .addStringOption((o) => o
        .setName('id')
        .setDescription('Aktives Giveaway auswählen')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand((s) => s
      .setName('reroll')
      .setDescription('Zieht Gewinner neu')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
      .addIntegerOption((o) => o.setName('anzahl').setDescription('Wie viele neue Gewinner').setMinValue(1).setRequired(true))
      .addBooleanOption((o) => o.setName('sieger_behalten').setDescription('Bereits gewählte Sieger behalten'))
    ),
  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'end' && sub !== 'edit' || !interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused().toLowerCase();
    const active = await giveawayService.listActive(interaction.guildId).catch(() => []);
    const choices = active
      .filter((g) => {
        const haystack = `${g.name || ''} ${g.id}`.toLowerCase();
        return !focused || haystack.includes(focused);
      })
      .slice(0, 25)
      .map((g) => ({ name: `${g.name || g.prize} • ID ${g.id}`, value: String(g.id) }));
    return interaction.respond(choices);
  },
  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ embeds: [embeds.error('Nur auf einem Server', 'Dieser Command funktioniert nur auf einem Discord-Server.', interaction.guild)], ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return giveawayService.createGiveaway(interaction, {
      name: interaction.options.getString('name'),
      duration: interaction.options.getString('dauer'),
      winners: interaction.options.getInteger('gewinner'),
      extraEntries: interaction.options.getString('extra_entries') || '',
      requirements: interaction.options.getString('requirements') || '',
    });
    if (sub === 'edit') return giveawayService.editGiveaway(interaction, interaction.options.getString('id'), {
      name: interaction.options.getString('name'),
      winners: interaction.options.getInteger('gewinner'),
      duration: interaction.options.getString('dauer'),
      extraEntries: interaction.options.getString('extra_entries'),
      requirements: interaction.options.getString('requirements'),
    });
    if (sub === 'end') return giveawayService.endNow(interaction, interaction.options.getString('id'));
    return giveawayService.reroll(interaction, interaction.options.getString('id'), interaction.options.getInteger('anzahl'), interaction.options.getBoolean('sieger_behalten') === true);
  },
};
