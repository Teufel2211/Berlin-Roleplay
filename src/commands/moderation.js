const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const moderationService = require('../services/moderationService');
const auditService = require('../services/auditService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const LOG_ACTIONS = ['ban', 'unban', 'kick', 'softban', 'warn', 'clear'];

async function logModeration(guild, moderator, action, target, reason, extra = {}) {
  try {
    await moderationService.logCase(guild.id, target.id, moderator.id, action, reason, extra.duration || null);
    const logChannelId = await settingsService.get(guild.id, 'moderation_log_channel_id');
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    const emoji = { ban: '🔨', unban: '✅', kick: '👢', softban: '🌀', warn: '⚠️', clear: '🗑️' }[action] || '🛡️';
    const fields = [
      { name: 'Nutzer', value: `<@${target.id}> (${target.tag || target.id})`, inline: true },
      { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
      { name: 'Grund', value: reason || 'Kein Grund angegeben' },
    ];
    if (extra.duration) fields.push({ name: 'Dauer', value: `${extra.duration} Sekunden`, inline: true });
    if (extra.count) fields.push({ name: 'Nachrichten', value: String(extra.count), inline: true });
    const embed = embeds.v2({
      color: action === 'ban' || action === 'kick' ? embeds.COLORS.error : action === 'warn' ? embeds.COLORS.warning : embeds.COLORS.info,
      title: `${emoji} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      description: fields.map((f) => `**${f.name}:** ${f.value}`).join('\n'),
      guild,
    });
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Moderations-Log fehlgeschlagen: ${err.message}`);
  }
}

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return val * multipliers[unit];
}

function formatDuration(seconds) {
  if (!seconds) return 'Unbegrenzt';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || 'Unbegrenzt';
}

const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderations-Befehle')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addSubcommand((s) => s
    .setName('ban')
    .setDescription('Bannt einen Nutzer vom Server')
    .addUserOption((o) => o.setName('nutzer').setDescription('Zu bannender Nutzer').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund für den Ban'))
    .addStringOption((o) => o.setName('dauer').setDescription('Ban-Dauer (z.B. 7d, 30d). Leer = permanent'))
    .addIntegerOption((o) => o.setName('nachrichten').setDescription('Nachrichten löschen (0-7 Tage, Standard: 0)').setMinValue(0).setMaxValue(7))
  )
  .addSubcommand((s) => s
    .setName('unban')
    .setDescription('Hebt den Ban eines Nutzers auf')
    .addStringOption((o) => o.setName('nutzer-id').setDescription('ID des gebannten Nutzers').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund für die Aufhebung'))
  )
  .addSubcommand((s) => s
    .setName('kick')
    .setDescription('Kickt einen Nutzer vom Server')
    .addUserOption((o) => o.setName('nutzer').setDescription('Zu klickender Nutzer').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund für den Kick'))
  )
  .addSubcommand((s) => s
    .setName('softban')
    .setDescription('Bannt + entbannt einen Nutzer (löscht seine Nachrichten)')
    .addUserOption((o) => o.setName('nutzer').setDescription('Zu softbannender Nutzer').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund für den Softban'))
    .addIntegerOption((o) => o.setName('nachrichten').setDescription('Nachrichten löschen (0-7 Tage, Standard: 7)').setMinValue(0).setMaxValue(7))
  )
  .addSubcommand((s) => s
    .setName('warn')
    .setDescription('Verwarnt einen Nutzer')
    .addUserOption((o) => o.setName('nutzer').setDescription('Zu verwarnender Nutzer').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund der Verwarnung').setRequired(true))
    .addIntegerOption((o) => o.setName('punkte').setDescription('Warn-Punkte (Standard: 1)').setMinValue(1).setMaxValue(100))
  )
  .addSubcommand((s) => s
    .setName('warnlist')
    .setDescription('Zeigt Verwarnungen eines Nutzers')
    .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer whose warnings to show').setRequired(true))
  )
  .addSubcommand((s) => s
    .setName('warndelete')
    .setDescription('Löscht eine Verwarnung')
    .addIntegerOption((o) => o.setName('id').setDescription('ID der Verwarnung').setRequired(true))
  )
  .addSubcommand((s) => s
    .setName('clear')
    .setDescription('Löscht Nachrichten aus dem Kanal')
    .addIntegerOption((o) => o.setName('anzahl').setDescription('Anzahl der Nachrichten (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('nutzer').setDescription('Nur Nachrichten dieses Nutzers'))
  )
  .addSubcommand((s) => s
    .setName('cases')
    .setDescription('Zeigt die letzten Moderations-Fälle')
    .addIntegerOption((o) => o.setName('limit').setDescription('Anzahl der Fälle (Standard: 10)').setMinValue(1).setMaxValue(50))
  )
  .addSubcommand((s) => s
    .setName('case')
    .setDescription('Zeigt Details eines bestimmten Falls')
    .addIntegerOption((o) => o.setName('id').setDescription('Fall-ID').setRequired(true))
  );

async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ embeds: [embeds.error('Nur auf Servern', 'Dieser Befehl kann nur auf einem Discord-Server verwendet werden.', interaction.guild)], flags: 64 });
  }

  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;
  const sub = interaction.options.getSubcommand();

  if (!helpers.isGuildAdmin(member, settings) && !helpers.isGuildModerator(member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du hast keine Berechtigung, diesen Befehl zu verwenden.', guild)], flags: 64 });
  }

  try {
    switch (sub) {
      case 'ban': {
        const target = interaction.options.getUser('nutzer');
        const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
        const durationStr = interaction.options.getString('dauer');
        const delDays = interaction.options.getInteger('nachrichten') || 0;
        const duration = parseDuration(durationStr);

        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (targetMember) {
          if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
            return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang bannen.', guild)], flags: 64 });
          }
          if (!targetMember.bannable) {
            return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden (fehlende Berechtigungen?).', guild)], flags: 64 });
          }
        }

        await interaction.deferReply();

        try {
          const banMsg = 'Du wurdest von **' + guild.name + '** gebannt.\n**Grund:** ' + reason + (duration ? '\n**Dauer:** ' + formatDuration(duration) : '\n**Dauer:** Permanent');
          await target.send({ embeds: [embeds.warning('🔨 Gebannt', banMsg, guild)] }).catch(() => {});
        } catch (_) {}

        await guild.members.ban(target, { deleteMessageSeconds: delDays * 86400, reason: `${reason} (von ${interaction.user.tag})` });
        await logModeration(guild, interaction.user, 'ban', target, reason, { duration });

        const durationText = duration ? `\n**Dauer:** ${formatDuration(duration)}` : '';
        return interaction.editReply({ embeds: [embeds.success('🔨 Gebannt', `<@${target.id}> wurde vom Server gebannt.\n**Grund:** ${reason}${durationText}`, guild)] });
      }

      case 'unban': {
        const targetId = interaction.options.getString('nutzer-id');
        const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

        await interaction.deferReply();

        let target;
        try {
          target = await guild.bans.fetch(targetId);
        } catch (_) {
          return interaction.editReply({ embeds: [embeds.error('Nicht gebannt', 'Dieser Nutzer ist nicht gebannt.', guild)] });
        }

        await guild.members.unban(targetId, `${reason} (von ${interaction.user.tag})`);
        const user = target.user || { id: targetId, tag: targetId };
        await logModeration(guild, interaction.user, 'unban', user, reason);

        return interaction.editReply({ embeds: [embeds.success('✅ Entbannt', `<@${targetId}> wurde entbannt.\n**Grund:** ${reason}`, guild)] });
      }

      case 'kick': {
        const target = interaction.options.getUser('nutzer');
        const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Dieser Nutzer ist nicht auf dem Server.', guild)], flags: 64 });
        }
        if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
          return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang kicken.', guild)], flags: 64 });
        }
        if (!targetMember.kickable) {
          return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gekickt werden.', guild)], flags: 64 });
        }

        await interaction.deferReply();

        try {
          await target.send({ embeds: [embeds.warning('👢 Gekickt', `Du wurdest von **${guild.name}** gekickt.\n**Grund:** ${reason}`, guild)] }).catch(() => {});
        } catch (_) {}

        await targetMember.kick(`${reason} (von ${interaction.user.tag})`);
        await logModeration(guild, interaction.user, 'kick', target, reason);

        return interaction.editReply({ embeds: [embeds.success('👢 Gekickt', `<@${target.id}> wurde vom Server gekickt.\n**Grund:** ${reason}`, guild)] });
      }

      case 'softban': {
        const target = interaction.options.getUser('nutzer');
        const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
        const delDays = interaction.options.getInteger('nachrichten') ?? 7;

        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (targetMember) {
          if (targetMember.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
            return interaction.reply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang softbannen.', guild)], flags: 64 });
          }
          if (!targetMember.bannable) {
            return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden.', guild)], flags: 64 });
          }
        }

        await interaction.deferReply();

        try {
          await target.send({ embeds: [embeds.warning('🌀 Softban', `Du wurdest von **${guild.name}** gesoftbannent (Ban + Entbannt).\n**Grund:** ${reason}`, guild)] }).catch(() => {});
        } catch (_) {}

        await guild.members.ban(target, { deleteMessageSeconds: delDays * 86400, reason: `Softban: ${reason} (von ${interaction.user.tag})` });
        await guild.members.unban(target.id, 'Softban: automatische Entbannt');
        await logModeration(guild, interaction.user, 'softban', target, reason);

        return interaction.editReply({ embeds: [embeds.success('🌀 Softban', `<@${target.id}> wurde gesoftbannent.\nNachrichten der letzten **${delDays} Tage** wurden gelöscht.\n**Grund:** ${reason}`, guild)] });
      }

      case 'warn': {
        const target = interaction.options.getUser('nutzer');
        const reason = interaction.options.getString('grund');
        const points = interaction.options.getInteger('punkte') || 1;

        if (target.bot) {
          return interaction.reply({ embeds: [embeds.error('Fehler', 'Bots können nicht verwarnt werden.', guild)], flags: 64 });
        }

        await interaction.deferReply();

        await moderationService.warn(gid, target.id, interaction.user.id, reason, points);
        const totalPoints = await moderationService.getWarningCount(gid, target.id);
        await logModeration(guild, interaction.user, 'warn', target, reason);

        try {
          await target.send({ embeds: [embeds.warning('⚠️ Verwarnung', `Du wurdest auf **${guild.name}** verwarnet.\n**Grund:** ${reason}\n**Punkte:** +${points} (Gesamt: ${totalPoints})`, guild)] }).catch(() => {});
        } catch (_) {}

        return interaction.editReply({ embeds: [embeds.success('⚠️ Verwarnung', `<@${target.id}> wurde verwarnet.\n**Grund:** ${reason}\n**Punkte:** +${points}\n**Gesamtpunkte:** ${totalPoints}`, guild)] });
      }

      case 'warnlist': {
        const target = interaction.options.getUser('nutzer');
        const warnings = await moderationService.getWarnings(gid, target.id);
        const totalPoints = warnings.reduce((sum, w) => sum + (w.points || 1), 0);

        if (!warnings.length) {
          return interaction.reply({ embeds: [embeds.info('Keine Verwarnungen', `<@${target.id}> hat keine Verwarnungen.`, guild)], ephemeral: true });
        }

        const lines = warnings.slice(0, 15).map((w, i) => {
          const date = new Date(w.created_at).toLocaleDateString('de-DE');
          return `**#${w.id}** — ${w.points || 1} Punkt(e) — ${date}\n> ${w.reason || 'Kein Grund'}`;
        });

        const more = warnings.length > 15 ? `\n\n... und ${warnings.length - 15} weitere` : '';
        return interaction.reply({
          embeds: [embeds.info(`⚠️ Verwarnungen: ${target.tag}`, `**Gesamtpunkte:** ${totalPoints}\n**Anzahl:** ${warnings.length}\n\n${lines.join('\n\n')}${more}`, guild)],
          ephemeral: true,
        });
      }

      case 'warndelete': {
        const id = interaction.options.getInteger('id');
        const warnings = await moderationService.getWarnings(gid, interaction.user.id);
        const warning = warnings.find((w) => w.id === id);

        if (!warning) {
          return interaction.reply({ embeds: [embeds.error('Nicht gefunden', `Verwarnung #${id} wurde nicht gefunden.`, guild)], flags: 64 });
        }

        await moderationService.deleteWarning(gid, id);
        return interaction.reply({ embeds: [embeds.success('Verwarnung gelöscht', `Verwarnung #${id} wurde gelöscht.`, guild)], ephemeral: true });
      }

      case 'clear': {
        const amount = interaction.options.getInteger('anzahl');
        const targetUser = interaction.options.getUser('nutzer');

        if (!interaction.channel.isTextBased()) {
          return interaction.reply({ embeds: [embeds.error('Fehler', 'Dieser Befehl kann nur in Textkanälen verwendet werden.', guild)], flags: 64 });
        }

        await interaction.deferReply({ ephemeral: true });

        let deleted = 0;
        if (targetUser) {
          let remaining = amount;
          while (remaining > 0) {
            const batch = Math.min(remaining, 100);
            const fetched = await interaction.channel.messages.fetch({ limit: batch });
            if (fetched.size === 0) break;
            const filtered = fetched.filter((m) => m.author.id === targetUser.id);
            if (filtered.size === 0) break;
            const deletedMsgs = await interaction.channel.bulkDelete(filtered, true);
            deleted += deletedMsgs.size;
            remaining -= fetched.size;
          }
        } else {
          deleted = await moderationService.clearMessages(interaction.channel, amount);
        }

        await logModeration(guild, interaction.user, 'clear', { id: interaction.user.id, tag: interaction.user.tag }, `${targetUser ? `<@${targetUser.id}>: ` : ''}${deleted} Nachrichten gelöscht`, { count: deleted });

        return interaction.editReply({ embeds: [embeds.success('🗑️ Gelöscht', `${deleted} Nachrichten wurden gelöscht.${targetUser ? ` (Nur von <@${targetUser.id}>)` : ''}`, guild)] });
      }

      case 'cases': {
        const limit = interaction.options.getInteger('limit') || 10;
        const cases = await moderationService.getCases(gid, limit);

        if (!cases.length) {
          return interaction.reply({ embeds: [embeds.info('Keine Fälle', 'Es gibt keine Moderations-Fälle.', guild)], ephemeral: true });
        }

        const lines = cases.map((c) => {
          const date = new Date(c.created_at).toLocaleDateString('de-DE');
          return `**#${c.id}** — \`${c.action}\` — <@${c.target_id}> — ${date}`;
        });

        return interaction.reply({
          embeds: [embeds.info('🛡️ Moderations-Fälle', lines.join('\n'), guild)],
          ephemeral: true,
        });
      }

      case 'case': {
        const id = interaction.options.getInteger('id');
        const cases = await moderationService.getCases(gid, 500);
        const c = cases.find((x) => x.id === id);

        if (!c) {
          return interaction.reply({ embeds: [embeds.error('Nicht gefunden', `Fall #${id} wurde nicht gefunden.`, guild)], flags: 64 });
        }

        const date = new Date(c.created_at).toLocaleString('de-DE');
        const fields = [
          `**Aktion:** ${c.action}`,
          `**Nutzer:** <@${c.target_id}>`,
          `**Moderator:** <@${c.moderator_id}>`,
          `**Grund:** ${c.reason || 'Kein Grund angegeben'}`,
          `**Datum:** ${date}`,
        ];
        if (c.duration_seconds) fields.push(`**Dauer:** ${formatDuration(c.duration_seconds)}`);

        return interaction.reply({
          embeds: [embeds.info(`🛡️ Fall #${c.id}`, fields.join('\n'), guild)],
          ephemeral: true,
        });
      }

      default:
        return interaction.reply({ embeds: [embeds.error('Unbekannt', 'Unbekannter Unterbefehl.', guild)], flags: 64 });
    }
  } catch (err) {
    logger.error(`Moderations-Befehl fehlgeschlagen: ${err.message}`);
    const reply = { embeds: [embeds.error('Fehler', `Der Befehl konnte nicht ausgeführt werden: ${err.message}`, guild)], flags: 64 };
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(reply);
    }
    return interaction.reply(reply);
  }
}

module.exports = { data, execute };
