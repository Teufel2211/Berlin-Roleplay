const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../discord/embeds');
const settingsService = require('../services/settingsService');
const moderationService = require('../services/moderationService');
const { hasModeratorAccess } = require('./moderationShared');
const logger = require('../logger');

const data = new SlashCommandBuilder()
  .setName('warnlist')
  .setDescription('Zeigt Verwarnungen eines Nutzers')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer, dessen Verwarnungen angezeigt werden').setRequired(true));

async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ embeds: [embeds.error('Nur auf Servern', 'Dieser Befehl kann nur auf einem Discord-Server verwendet werden.', interaction.guild)], flags: 64 });
  }
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;
  if (!hasModeratorAccess(member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du hast keine Berechtigung, diesen Befehl zu verwenden.', guild)], flags: 64 });
  }

  try {
    const target = interaction.options.getUser('nutzer');
    const warnings = await moderationService.getWarnings(gid, target.id);
    const totalPoints = warnings.reduce((sum, w) => sum + (w.points || 1), 0);

    if (!warnings.length) {
      return interaction.reply({ embeds: [embeds.info('Keine Verwarnungen', `<@${target.id}> hat keine Verwarnungen.`, guild)], flags: 64 });
    }

    const lines = warnings.slice(0, 15).map((w, i) => {
      const date = new Date(w.created_at).toLocaleDateString('de-DE');
      return `**#${w.id}** — ${w.points || 1} Punkt(e) — ${date}\n> ${w.reason || 'Kein Grund'}`;
    });

    const more = warnings.length > 15 ? `\n\n... und ${warnings.length - 15} weitere` : '';
    return interaction.reply({
      embeds: [embeds.info(`⚠️ Verwarnungen: ${target.tag}`, `**Gesamtpunkte:** ${totalPoints}\n**Anzahl:** ${warnings.length}\n\n${lines.join('\n\n')}${more}`, guild)],
      flags: 64,
    });
  } catch (err) {
    logger.error(`Warnlist-Befehl fehlgeschlagen: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 });
  }
}

module.exports = { data, execute };