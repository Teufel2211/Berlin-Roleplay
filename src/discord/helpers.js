const { ActionRowBuilder, ButtonBuilder } = require('discord.js');

function parseRoleSetting(value) {
  if (!value) return [];
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (err) {
      return [];
    }
    return [];
  }
  return [trimmed];
}

function findRole(guild, name) {
  if (!name) return null;
  return guild.roles.cache.find((r) => r.name === name);
}

function resolveRoles(guild, value) {
  const names = parseRoleSetting(value);
  return names.map((name) => findRole(guild, name)).filter(Boolean);
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

function memberHasAnyRoleSetting(member, value) {
  return memberHasAnyRole(member, parseRoleSetting(value));
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
  if (member && member.id === member.guild.ownerId) return true;
  const staff = settings.staff_roles;
  const admin = settings.admin_roles;
  return Boolean(staff && memberHasAnyRoleSetting(member, staff)) || Boolean(admin && memberHasAnyRoleSetting(member, admin));
}

function isGuildAdmin(member, settings) {
  if (member && member.id === member.guild.ownerId) return true;
  return Boolean(settings.admin_roles && memberHasAnyRoleSetting(member, settings.admin_roles));
}

function hasModeratorAccess(member, settings) {
  const allowed = String((settings && settings.moderation_allowed_roles) || '').trim();
  if (allowed && allowed !== '[]') {
    const roles = parseRoleSetting(allowed);
    if (roles.length) return isGuildAdmin(member, settings) || memberHasAnyRole(member, roles);
  }
  return isGuildAdmin(member, settings) || isGuildModerator(member, settings);
}

module.exports = {
  parseRoleSetting,
  resolveRoles,
  findRole,
  findChannel,
  hasRole,
  memberHasAnyRole,
  memberHasAnyRoleSetting,
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
  hasModeratorAccess,
};
