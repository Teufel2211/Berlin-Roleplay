const { SlashCommandBuilder } = require('discord.js');
const settingsService = require('../services/settingsService');
const teamService = require('../services/teamService');
const auditService = require('../services/auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Teamverwaltung')
    .addSubcommand((s) => s.setName('liste').setDescription('Zeigt die aktuellen Teammitglieder'))
    .addSubcommand((s) => s.setName('hinzufuegen').setDescription('Fügt ein Teammitglied hinzu').addUserOption((o) => o.setName('mitglied').setDescription('Teammitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('entfernen').setDescription('Entfernt ein Teammitglied').addUserOption((o) => o.setName('mitglied').setDescription('Teammitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('abwesenheiten').setDescription('Zeigt eingetragene Abwesenheiten')),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const settings = await settingsService.getAll(guildId);
    if (!helpers.isGuildModerator(interaction.member, settings)) {
      return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann die Teamverwaltung nutzen.', interaction.guild)], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'liste') {
      const [members, ranks, departments] = await Promise.all([
        teamService.listMembers(guildId),
        teamService.listRanks(guildId),
        teamService.listDepartments(guildId),
      ]);
      const lines = members.length
        ? members.map((m) => {
            const rank = ranks.find((r) => r.id === m.rank_id);
            const dep = departments.find((d) => d.id === m.department_id);
            return `• <@${m.discord_id}> — **${rank?.name || 'Ohne Rang'}**${dep ? ` · ${dep.name}` : ''} · ${m.status}`;
          })
        : ['Noch keine Teammitglieder eingetragen.'];
      return interaction.reply({ embeds: [embeds.info('Team-Liste', lines.slice(0, 25).join('\n'), interaction.guild)], ephemeral: true });
    }

    const member = interaction.options.getUser('mitglied');
    if (sub === 'hinzufuegen') {
      await teamService.upsertMember(guildId, member.id, { joined_at: new Date().toISOString(), status: 'aktiv' });
      await auditService.log(guildId, interaction.user.tag, 'team.member.add', { discord_id: member.id });
      return interaction.reply({ embeds: [embeds.success('Teammitglied hinzugefügt', `<@${member.id}> wurde in die Team-Liste aufgenommen.`, interaction.guild)], ephemeral: true });
    }

    if (sub === 'entfernen') {
      await teamService.removeMember(guildId, member.id);
      await auditService.log(guildId, interaction.user.tag, 'team.member.remove', { discord_id: member.id });
      return interaction.reply({ embeds: [embeds.success('Teammitglied entfernt', `<@${member.id}> wurde aus der Team-Liste entfernt.`, interaction.guild)], ephemeral: true });
    }

    if (sub === 'abwesenheiten') {
      const absences = await teamService.listAbsences(guildId);
      const lines = absences.length
        ? absences.slice(0, 15).map((a) => `• <@${a.discord_id}> — ${new Date(a.starts_at).toLocaleDateString('de-DE')} bis ${new Date(a.ends_at).toLocaleDateString('de-DE')}${a.reason ? ` — ${a.reason}` : ''}`)
        : ['Keine Abwesenheiten eingetragen.'];
      return interaction.reply({ embeds: [embeds.info('Team-Abwesenheiten', lines.join('\n'), interaction.guild)], ephemeral: true });
    }
  },
};
