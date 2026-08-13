const crypto = require('crypto');
const { config } = require('../config');
const logger = require('../logger');
const settingsService = require('../services/settingsService');
const { discordAuthStart, discordAuthCallback } = require('./discordAuth');

const LOGIN_ERRORS = {
  denied: 'Die Anmeldung wurde abgebrochen.',
  state: 'Ungültige Anmeldung. Bitte erneut versuchen.',
  oauth: 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
  notmember: 'Du bist kein Mitglied des Discord-Servers.',
  norole: 'Du hast keine Berechtigung für das Dashboard (nur Server-Owner, Staff und Admin).',
};

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfCheck(req, res, next) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  let originOk = true;
  if (req.headers.origin) originOk = req.headers.origin === config.webUrl;
  let hostOk = true;
  try {
    const allowedHost = new URL(config.webUrl).host;
    hostOk = !req.headers.host || req.headers.host === allowedHost;
  } catch (err) { hostOk = true; }
  if (!req.session || !token || token !== req.session.csrf || !originOk || !hostOk) {
    logger.warn(`CSRF-Ablehnung von ${req.ip}`);
    return res.status(403).render('error', { title: 'Fehler', user: null, csrf: csrfToken(req), message: 'Ungültige Anfrage (CSRF-Schutz)' });
  }
  return next();
}

function requireAuth(req, res, next) {
  if (req.path === '/login' || req.path === '/logout') return next();
  if (req.session && req.session.user) return next();
  return res.redirect('/dashboard/login');
}

function requireAuthApi(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Nicht angemeldet' });
}

async function loginPage(req, res) {
  let settingsLocked = false;
  try {
    settingsLocked = Boolean(await settingsService.get('admin_code'));
  } catch (err) { /* keine Settings verfügbar */ }
  res.render('login', {
    title: 'Login',
    user: null,
    error: LOGIN_ERRORS[req.query.error] || null,
    csrf: csrfToken(req),
    settingsLocked,
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
};
