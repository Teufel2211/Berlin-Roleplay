const crypto = require('crypto');
const { config } = require('../config');
const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const logger = require('../logger');

const OAUTH_BASE = 'https://discord.com/api';

function redirectUri() {
  return new URL('/dashboard/auth/discord/callback', config.webUrl).href;
}

function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify',
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

async function fetchGuildRoles() {
  const res = await fetch(`${OAUTH_BASE}/guilds/${config.guildId}/roles`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Rollenabruf fehlgeschlagen (${res.status})`);
  return res.json();
}

async function fetchGuildMember(userId) {
  const res = await fetch(`${OAUTH_BASE}/guilds/${config.guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Member-Abruf fehlgeschlagen (${res.status})`);
  return res.json();
}

function isStaff(memberRoleIds, roleList, settings) {
  const allowed = new Set(
    roleList.filter((r) => r.name === settings.staff_role || r.name === settings.admin_role).map((r) => r.id)
  );
  return memberRoleIds.some((id) => allowed.has(id));
}

function discordAuthStart(req, res) {
  if (!config.discordClientSecret) {
    return res.status(500).render('error', { title: 'Fehler', user: null, message: 'Discord-OAuth2 ist nicht konfiguriert (DISCORD_CLIENT_SECRET fehlt).' });
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  res.redirect(authorizeUrl(state));
}

async function discordAuthCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/dashboard/login?error=denied');
  if (!code || !state || !req.session.oauthState || state !== req.session.oauthState) {
    logger.warn(`OAuth-State-Mismatch von ${req.ip}`);
    return res.redirect('/dashboard/login?error=state');
  }
  delete req.session.oauthState;
  try {
    const token = await exchangeCode(code);
    const user = await fetchDiscordUser(token.access_token);
    const member = await fetchGuildMember(user.id);
    if (!member) {
      return res.redirect('/dashboard/login?error=notmember');
    }
    const settings = await settingsService.getAll();
    const roles = await fetchGuildRoles();
    if (!isStaff(member.roles || [], roles, settings)) {
      await auditService.log(`${user.username} (${user.id})`, 'login.denied', { reason: 'keine Staff-Rolle' });
      return res.redirect('/dashboard/login?error=norole');
    }
    const tag = user.global_name || user.username;
    req.session.regenerate((err) => {
      if (err) logger.error(`Session-Regeneration fehlgeschlagen: ${err.message}`);
      req.session.user = tag;
      req.session.discordId = user.id;
      req.session.csrf = crypto.randomBytes(32).toString('hex');
      auditService.log(`${tag} (${user.id})`, 'login.success', {});
      res.redirect('/dashboard');
    });
  } catch (err) {
    logger.error(`OAuth-Login fehlgeschlagen: ${err.message}`);
    res.redirect('/dashboard/login?error=oauth');
  }
}

module.exports = { discordAuthStart, discordAuthCallback };
