const crypto = require('crypto');
const { config } = require('../config');
const settingsService = require('../services/settingsService');
const { parseRoleSetting } = require('../discord/helpers');
const auditService = require('../services/auditService');
const logger = require('../logger');

const OAUTH_BASE = 'https://discord.com/api';
const STATE_COOKIE = 'oauth_state';
const MANAGE_GUILD = 32n;

function redirectUri() {
  return new URL('/dashboard/auth/discord/callback', config.webUrl).href;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.webUrl.startsWith('https://'),
    signed: true,
    maxAge: 10 * 60 * 1000,
  };
}

function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.webUrl.startsWith('https://'),
    signed: true,
    path: '/',
  };
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
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.discordClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(`${OAUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token-Austausch fehlgeschlagen (${res.status}) ${text}`);
  }
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${OAUTH_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Nutzerabruf fehlgeschlagen (${res.status})`);
  return res.json();
}

async function fetchMyGuilds(accessToken) {
  const res = await fetch(`${OAUTH_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Serverliste fehlgeschlagen (${res.status})`);
  return res.json();
}

function isGuildOwner(guild) {
  return Boolean(guild && guild.owner);
}

function hasManageGuild(guild) {
  if (!guild || typeof guild.permissions !== 'string') return false;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch (err) {
    return false;
  }
}

function canAccessGuild(guild) {
  return Boolean(guild && (isGuildOwner(guild) || hasManageGuild(guild)));
}

function accessibleGuilds(guilds) {
  return (guilds || []).filter(canAccessGuild);
}

function isOwner(session) {
  return Boolean(session && session.user && session.user.id === config.ownerUserId);
}

async function canManageGuild(session, guild) {
  if (isOwner(session)) return true;
  if (!canAccessGuild(guild)) return false;
  const member = await fetchGuildMember(session.user.id, guild.id);
  if (!member) return canAccessGuild(guild);
  const settings = await settingsService.getAll(guild.id);
  const roleNames = new Set([...parseRoleSetting(settings.staff_roles), ...parseRoleSetting(settings.admin_roles)]);
  if (!roleNames.size) return true;
  const guildRoles = await fetchGuildRoles(guild.id);
  const allowedIds = new Set(guildRoles.filter((r) => roleNames.has(r.name)).map((r) => r.id));
  return (member.roles || []).some((id) => allowedIds.has(id));
}

async function fetchGuildRoles(guildId) {
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Rollenabruf fehlgeschlagen (${res.status})`);
  return res.json();
}

async function fetchGuildMember(userId, guildId) {
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Member-Abruf fehlgeschlagen (${res.status})`);
  return res.json();
}

function discordAuthStart(req, res) {
  if (!config.discordClientSecret) {
    return res.status(500).render('error', { title: 'Fehler', user: null, message: 'Discord-OAuth2 ist nicht konfiguriert (DISCORD_CLIENT_SECRET fehlt).' });
  }
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, cookieOptions());
  res.redirect(authorizeUrl(state));
}

async function discordAuthCallback(req, res) {
  const { code, state, error } = req.query;
  const cookieState = req.signedCookies && req.signedCookies[STATE_COOKIE];
  if (error) {
    res.clearCookie(STATE_COOKIE, clearCookieOptions());
    return res.redirect('/dashboard/login?error=denied');
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    logger.warn(`OAuth-State-Mismatch von ${req.ip}`);
    res.clearCookie(STATE_COOKIE, clearCookieOptions());
    return res.redirect('/dashboard/login?error=state');
  }
  res.clearCookie(STATE_COOKIE, clearCookieOptions());
  try {
    const token = await exchangeCode(code);
    const user = await fetchDiscordUser(token.access_token);
    const guilds = await fetchMyGuilds(token.access_token);
    const accessible = accessibleGuilds(guilds);

    req.session.regenerate((err) => {
      if (err) logger.error(`Session-Regeneration fehlgeschlagen: ${err.message}`);
      req.session.user = {
        id: user.id,
        tag: user.global_name || user.username,
        avatar: user.avatar || null,
      };
      req.session.accessToken = token.access_token;
      req.session.refreshToken = token.refresh_token || null;
      req.session.guilds = guilds;
      req.session.csrf = crypto.randomBytes(32).toString('hex');
      auditService.log(null, `${req.session.user.tag} (${user.id})`, 'login.success', { accessibleGuilds: accessible.length });
      res.redirect('/dashboard');
    });
  } catch (err) {
    logger.error(`OAuth-Login fehlgeschlagen: ${err.message}`);
    res.redirect('/dashboard/login?error=oauth');
  }
}

module.exports = {
  discordAuthStart,
  discordAuthCallback,
  canAccessGuild,
  accessibleGuilds,
  isGuildOwner,
  hasManageGuild,
  canManageGuild,
  fetchGuildMember,
  fetchGuildRoles,
};
