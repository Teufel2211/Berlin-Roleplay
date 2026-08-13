const { ActionRowBuilder, ButtonBuilder } = require('discord.js');

function findRole(guild, name) {
  if (!name) return null;
  return guild.roles.cache.find((r) => r.name === name);
}

function findChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id);
}

function hasRole(member, roleName) {
  if (!roleName) return false;
  return member.roles.cache.some((r) => r.name === roleName);
}

function memberHasAnyRole(member, roleNames) {
  return roleNames.some((name) => hasRole(member, name));
}

function parseDuration(str) {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(String(str).trim());
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * map[unit];
}

function formatRemaining(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}T`);
  if (h) parts.push(`${h}Std.`);
  if (m) parts.push(`${m}Min.`);
  if (sec && !d && !h) parts.push(`${sec}s`);
  return parts.join(' ');
}

function formatNumber(n) {
  return Number(n).toLocaleString('de-DE');
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function primaryButton(customId, label, emoji) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(1).setEmoji(emoji);
}

function successButton(customId, label, emoji) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(3).setEmoji(emoji);
}

function dangerButton(customId, label, emoji) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(4).setEmoji(emoji);
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(buttons);
}

function isGuildModerator(member, settings) {
  const staff = settings.staff_role;
  const admin = settings.admin_role;
  return Boolean(staff && hasRole(member, staff)) || Boolean(admin && hasRole(member, admin));
}

function isGuildAdmin(member, settings) {
  return Boolean(settings.admin_role && hasRole(member, settings.admin_role));
}

module.exports = {
  findRole,
  findChannel,
  hasRole,
  memberHasAnyRole,
  parseDuration,
  formatRemaining,
  formatNumber,
  formatDateTime,
  primaryButton,
  successButton,
  dangerButton,
  row,
  isGuildModerator,
  isGuildAdmin,
};
