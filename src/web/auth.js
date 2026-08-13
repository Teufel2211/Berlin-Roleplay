const crypto = require('crypto');
const { config } = require('../config');
const logger = require('../logger');
const { ensureAdminCode } = require('./adminCode');
const { discordAuthStart, discordAuthCallback } = require('./discordAuth');

const LOGIN_ERRORS = {
  denied: 'Die Anmeldung wurde abgebrochen.',
  state: 'Ungültige Anmeldung. Bitte erneut versuchen.',
  oauth: 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
  notmember: 'Du bist kein Mitglied des Discord-Servers.',
  norole: 'Du hast keine Berechtigung für das Dashboard (nur Server-Owner, Staff und Admin).',
  code: 'Code ungültig, abgelaufen oder bereits benutzt.',
};

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfCheck(req, res, next) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  let sameOrigin = true;
  if (req.headers.origin) {
    try {
      const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const o = new URL(req.headers.origin);
      sameOrigin = o.host === req.headers.host && o.protocol === proto + ':';
    } catch (err) {
      sameOrigin = false;
    }
  }
  if (!req.session || !token || token !== req.session.csrf || !sameOrigin) {
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
  try {
    await ensureAdminCode();
  } catch (err) {
    logger.warn(`Login-Seite: Admin-Code konnte nicht generiert/gesendet werden: ${err.message}`);
  }
  res.render('login', {
    title: 'Login',
    user: null,
    error: LOGIN_ERRORS[req.query.error] || null,
    codeError: req.query.error === 'code',
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
};
