const crypto = require('crypto');
const logger = require('../logger');
const { config } = require('../config');
const discordAuth = require('./discordAuth');
const { discordAuthStart, discordAuthCallback } = discordAuth;

const LOGIN_ERRORS = {
  denied: 'Die Anmeldung wurde abgebrochen.',
  state: 'Ungültige Anmeldung. Bitte erneut versuchen.',
  oauth: 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
  session: 'Sitzung abgelaufen – Seite wurde neu geladen. Bitte erneut versuchen.',
};

const OAUTH_BASE = 'https://discord.com/api';

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfFailReason(req) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (!req.session) return 'noSession';
  if (!token) return 'noToken';
  if (token !== req.session.csrf) return 'tokenMismatch';
  if (req.headers.origin) {
    try {
      const o = new URL(req.headers.origin);
      if (o.host !== req.headers.host) return 'originMismatch';
    } catch (err) {
      // Origin nicht parsbar (z. B. "null") -> Token-Check + SameSite-Cookie reichen
    }
  }
  return null;
}

function csrfCheck(req, res, next) {
  const fail = csrfFailReason(req);
  if (fail) {
    logger.warn(`CSRF-Ablehnung von ${req.ip}: ${fail}`);
    return res.status(403).render('error', { title: res.locals.t('error.title'), user: null, csrf: csrfToken(req), message: res.locals.t('error.csrf') });
  }
  return next();
}

async function refreshDiscordGuilds(req) {
  if (!req.session || !req.session.user) return;

  try {
    const botGuilds = await discordAuth.fetchBotGuilds();
    const botGuildIds = new Set(botGuilds.map((guild) => guild.id));

    // Der globale Owner bekommt alle Server des Bots und Vollzugriff.
    if (discordAuth.isOwner(req.session)) {
      req.session.guilds = botGuilds.map((guild) => ({ ...guild, ownerAccess: true, botInstalled: true }));
      req.session.guildsSyncedAt = Date.now();
      req.session.user.isOwner = true;
      return;
    }

    if (!req.session.accessToken) return;

    const res = await fetch(`${OAUTH_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${req.session.accessToken}` },
    });

    if (!res.ok) {
      logger.warn(`Discord-Serverliste konnte nicht aktualisiert werden (${res.status}).`);
      return;
    }

    const guilds = await res.json();
    req.session.guilds = (Array.isArray(guilds) ? guilds : []).map((guild) => ({
      ...guild,
      botInstalled: botGuildIds.has(guild.id),
    }));
    req.session.guildsSyncedAt = Date.now();
    req.session.user.isOwner = false;
  } catch (err) {
    logger.warn(`Discord-Serverliste konnte nicht synchronisiert werden: ${err.message}`);
  }
}

async function requireAuth(req, res, next) {
  if (req.path === '/login' || req.path === '/logout') return next();
  if (!req.session || !req.session.user) return res.redirect('/dashboard/login');

  // Serverliste und Bot-Installation werden bei jedem Dashboard-Request synchronisiert.
  await refreshDiscordGuilds(req);
  return next();
}

function requireAuthApi(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Nicht angemeldet' });
}

async function loginPage(req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.render('login', {
    title: res.locals.t('login.title'),
    user: null,
    error: LOGIN_ERRORS[req.query.error] || null,
    csrf: csrfToken(req),
  });
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/dashboard/login'));
}

module.exports = {
  csrfToken,
  csrfCheck,
  requireAuth,
  requireAuthApi,
  loginPage,
  logout,
  discordAuthStart,
  discordAuthCallback,
  refreshDiscordGuilds,
};
