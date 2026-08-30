const logger = require('../logger');
const embeds = require('../discord/embeds');
const settingsService = require('./settingsService');

function parseModuleList(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : null; } catch (_) { return null; }
}

const DEFAULT_MESSAGE = 'Willkommen {user}! Schön, dass du auf {server} bist.';

function renderMessage(message, member) {
  return String(message || '')
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{server\}/g, member.guild.name);
}

function parseRoleIds(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  const trimmed = String(raw).trim();
  if (!trimmed.startsWith('[')) return trimmed ? [trimmed] : [];
  try { const arr = JSON.parse(trimmed); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : []; } catch (_) { return []; }
}

async function assignWelcomeRoles(member, all) {
  const roleIds = parseRoleIds(all.welcome_role);
  if (!roleIds.length || !member.roles || typeof member.roles.add !== 'function') return;
  try {
    await member.roles.add(roleIds);
    logger.info(`Willkommen: Rollen ${roleIds.join(', ')} an ${member.user.tag} vergeben (${member.guild.name})`);
  } catch (err) {
    logger.warn(`Willkommen: Rollen ${roleIds.join(', ')} konnten ${member.user.tag} nicht vergeben werden (${err.message})`);
  }
}

async function handleMemberAdd(member) {
  try {
    if (!member || !member.guild) return;
    const all = await settingsService.getAll(member.guild.id).catch(() => ({}));
    const list = parseModuleList(all.enabled_modules);
    if (list !== null && !list.includes('welcome')) return;
    await assignWelcomeRoles(member, all);
    const channelId = String(all.welcome_channel_id || '').trim();
    if (!channelId) return;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') {
      logger.warn(`Willkommen: Kanal ${channelId} nicht verfügbar auf Server ${member.guild.id}`);
      return;
    }
    await channel.send({ embeds: [embeds.info('Willkommen', renderMessage(all.welcome_message, member), member.guild)] });
    logger.info(`Willkommensnachricht gesendet an ${member.user.tag} auf ${member.guild.name}`);
  } catch (err) {
    logger.warn(`Willkommensnachricht fehlgeschlagen für ${member.id}: ${err.message}`);
  }
}

module.exports = { handleMemberAdd, renderMessage, DEFAULT_MESSAGE };