const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/moderationService');
const embeds = require('../discord/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderationsverwaltung')
    .addSubcommand((s) => s.setName('warn').setDescription('Verwarnt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true)).addIntegerOption((o) => o.setName('punkte').setDescription('Warnpunkte').setMinValue(1).setMaxValue(100)))
    .addSubcommand((s) => s.setName('timeout').setDescription('Timeout für ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('minuten').setDescription('Dauer in Minuten').setMinValue(1).setMaxValue(10080)).addStringOption((o) => o.setName('grund').setDescription('Grund')))
    .addSubcommand((s) => s.setName('kick').setDescription('Kickt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund')))
    .addSubcommand((s) => s.setName('ban').setDescription('Bannt ein Mitglied').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund'))),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.KickMembers) && !interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du besitzt keine Moderationsberechtigung.', interaction.guild)], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('mitglied');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    const guild = interaction.guild;

    if (sub === 'warn') {
      const points = interaction.options.getInteger('punkte') || 1;
      await moderationService.warn(guild.id, target.id, interaction.user.id, reason, points);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'warn', reason);
      return interaction.reply({ embeds: [embeds.success('Verwarnung', `<@${target.id}> wurde mit **${points}** Warnpunkt(en) verwarnt.\nGrund: ${reason}`, guild)], ephemeral: true });
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Das Mitglied ist nicht auf dem Server.', guild)], ephemeral: true });

    if (sub === 'timeout') {
      const minutes = interaction.options.getInteger('minuten') || 10;
      await member.timeout(minutes * 60 * 1000, reason);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'timeout', reason, minutes * 60);
      return interaction.reply({ embeds: [embeds.success('Timeout', `<@${target.id}> erhielt einen Timeout für **${minutes} Minuten**.`, guild)], ephemeral: true });
    }
    if (sub === 'kick') {
      await member.kick(reason);
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'kick', reason);
      return interaction.reply({ embeds: [embeds.success('Kick', `<@${target.id}> wurde gekickt.`, guild)], ephemeral: true });
    }
    if (sub === 'ban') {
      await member.ban({ reason });
      await moderationService.logCase(guild.id, target.id, interaction.user.id, 'ban', reason);
      return interaction.reply({ embeds: [embeds.success('Ban', `<@${target.id}> wurde gebannt.`, guild)], ephemeral: true });
    }
  },
};
