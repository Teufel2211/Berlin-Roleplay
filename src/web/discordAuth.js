const crypto = require('crypto');
const { config } = require('../config');
const settingsService = require('../services/settingsService');
const { parseRoleSetting } = require('../discord/helpers');
const auditService = require('../services/auditService');
const logger = require('../logger');

const OAUTH_BASE = 'https://discord.com/api';
const STATE_COOKIE = 'oauth_state';
const MANAGE_GUILD = 32n;
const FETCH_TTL = 60 * 1000;
const guildRolesCache = new Map();
const guildMemberCache = new Map();

function cachedGet(map, key) {
  const entry = map.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) map.delete(key);
    return undefined;
  }
  return entry.data;
}

function cachedSet(map, key, value) {
  map.set(key, { data: value, expiresAt: Date.now() + FETCH_TTL });
}

function redirectUri() {
  return new URL('/dashboard/auth/discord/callback', config.webUrl).href;
}

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: config.webUrl.startsWith('https://'), signed: true, maxAge: 10 * 60 * 1000 };
}

function clearCookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: config.webUrl.startsWith('https://'), signed: true, path: '/' };
}

function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  return `${OAUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.discordClientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const res = await fetch(`${OAUTH_BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!res.ok) throw new Error(`Token-Austausch fehlgeschlagen (${res.status})`);
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${OAUTH_BASE}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Nutzerabruf fehlgeschlagen (${res.status})`);
  return res.json();
}

async function fetchMyGuilds(accessToken) {
  const res = await fetch(`${OAUTH_BASE}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Serverliste fehlgeschlagen (${res.status})`);
  return res.json();
}

const BOT_GUILDS_TTL = 60 * 1000;
let botGuildsCache = null;
let botGuildsInflight = null;

async function fetchBotGuilds() {
  if (!config.discordToken) throw new Error('DISCORD_TOKEN fehlt.');
  if (botGuildsCache && botGuildsCache.expiresAt > Date.now()) return botGuildsCache.data;
  if (botGuildsInflight) return botGuildsInflight;

  const task = (async () => {
    try {
      const res = await fetch(`${OAUTH_BASE}/users/@me/guilds`, { headers: { Authorization: `Bot ${config.discordToken}` } });
      if (!res.ok) {
        if (botGuildsCache) return botGuildsCache.data;
        throw new Error(`Bot-Serverliste fehlgeschlagen (${res.status})`);
      }
      const guilds = await res.json();
      if (!Array.isArray(guilds)) throw new Error('Bot-Serverliste ungültig');
      botGuildsCache = { data: guilds, expiresAt: Date.now() + BOT_GUILDS_TTL };
      return guilds;
    } finally {
      if (botGuildsInflight === task) botGuildsInflight = null;
    }
  })();
  botGuildsInflight = task;
  return task;
}

async function fetchGuild(guildId) {
  const guilds = await fetchBotGuilds();
  return guilds.find((guild) => guild.id === guildId) || null;
}

function isGuildOwner(guild) { return Boolean(guild && guild.owner); }
function hasManageGuild(guild) {
  if (!guild || typeof guild.permissions !== 'string') return false;
  try { return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD; } catch (_) { return false; }
}
function canAccessGuild(guild) { return Boolean(guild && (guild.ownerAccess === true || isGuildOwner(guild) || hasManageGuild(guild))); }
function accessibleGuilds(guilds) { return (guilds || []).filter(canAccessGuild); }
function isOwner(session) { return Boolean(session && session.user && session.user.id === config.ownerUserId); }

async function canManageGuild(session, guild) {
  if (isOwner(session)) return true;
  if (!canAccessGuild(guild)) return false;
  const [member, settings, guildRoles] = await Promise.all([
    fetchGuildMember(session.user.id, guild.id),
    settingsService.getAll(guild.id),
    fetchGuildRoles(guild.id),
  ]);
  if (!member || !guildRoles) return canAccessGuild(guild);
  const roleNames = new Set([...parseRoleSetting(settings.staff_roles), ...parseRoleSetting(settings.admin_roles)]);
  if (!roleNames.size) return true;
  const allowedIds = new Set(guildRoles.filter((r) => roleNames.has(r.name)).map((r) => r.id));
  return (member.roles || []).some((id) => allowedIds.has(id));
}

async function fetchGuildRoles(guildId) {
  const cached = cachedGet(guildRolesCache, guildId);
  if (cached !== undefined) return cached;
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${config.discordToken}` } });
  if (!res.ok) throw new Error(`Rollenabruf fehlgeschlagen (${res.status})`);
  const roles = await res.json();
  cachedSet(guildRolesCache, guildId, roles);
  return roles;
}

async function fetchGuildMember(userId, guildId) {
  const key = `${guildId}|${userId}`;
  const cached = cachedGet(guildMemberCache, key);
  if (cached !== undefined) return cached;
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${config.discordToken}` } });
  if (res.status === 404) {
    cachedSet(guildMemberCache, key, null);
    return null;
  }
  if (!res.ok) throw new Error(`Member-Abruf fehlgeschlagen (${res.status})`);
  const member = await res.json();
  cachedSet(guildMemberCache, key, member);
  return member;
}

function discordAuthStart(req, res) {
  if (!config.discordClientSecret) return res.status(500).render('error', { title: res.locals.t('error.title'), user: null, csrf: req.session?.csrf || '', message: res.locals.t('error.oauthNotConfigured') });
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, cookieOptions());
  res.redirect(authorizeUrl(state));
}

async function discordAuthCallback(req, res) {
  const { code, state, error } = req.query;
  const cookieState = req.signedCookies && req.signedCookies[STATE_COOKIE];
  if (error) { res.clearCookie(STATE_COOKIE, clearCookieOptions()); return res.redirect('/dashboard/login?error=denied'); }
  if (!code || !state || !cookieState || state !== cookieState) { res.clearCookie(STATE_COOKIE, clearCookieOptions()); return res.redirect('/dashboard/login?error=state'); }
  res.clearCookie(STATE_COOKIE, clearCookieOptions());
  try {
    const token = await exchangeCode(code);
    const [user, myGuilds] = await Promise.all([fetchDiscordUser(token.access_token), fetchMyGuilds(token.access_token)]);
    const ownerLogin = user.id === config.ownerUserId;
    const guilds = ownerLogin ? (await fetchBotGuilds()).map((guild) => ({ ...guild, ownerAccess: true, botInstalled: true })) : myGuilds;
    req.session.regenerate((err) => {
      if (err) logger.error(`Session-Regeneration fehlgeschlagen: ${err.message}`);
      req.session.user = { id: user.id, tag: user.global_name || user.username, avatar: user.avatar || null, isOwner: ownerLogin };
      req.session.accessToken = token.access_token;
      req.session.refreshToken = token.refresh_token || null;
      req.session.tokenExpiresAt = Date.now() + Number(token.expires_in || 604800) * 1000;
      req.session.guilds = guilds;
      req.session.guildsSyncedAt = Date.now();
      auditService.log(null, `${req.session.user.tag} (${user.id})`, 'login.success', { accessibleGuilds: accessibleGuilds(guilds).length, owner: ownerLogin });
      res.redirect('/dashboard');
    });
  } catch (err) {
    logger.error(`OAuth-Login fehlgeschlagen: ${err.message}`);
    res.redirect('/dashboard/login?error=oauth');
  }
}

module.exports = { discordAuthStart, discordAuthCallback, canAccessGuild, accessibleGuilds, isGuildOwner, hasManageGuild, isOwner, canManageGuild, fetchGuildMember, fetchGuildRoles, fetchBotGuilds, fetchGuild };
