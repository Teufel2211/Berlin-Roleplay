const moderationService = require('../services/moderationService');
const settingsService = require('../services/settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

function hasModeratorAccess(member, settings) {
  return helpers.isGuildAdmin(member, settings) || helpers.isGuildModerator(member, settings);
}

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

module.exports = { hasModeratorAccess, logModeration, parseDuration, formatDuration };