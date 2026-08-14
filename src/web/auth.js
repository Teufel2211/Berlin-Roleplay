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
  session: 'Sitzung abgelaufen – Seite wurde neu geladen. Bitte erneut versuchen.',
};

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
      if (new URL(req.headers.origin).host !== req.headers.host) return 'originMismatch';
    } catch (err) {
      return 'originInvalid';
    }
  }
  return null;
}

function csrfCheck(req, res, next) {
  const fail = csrfFailReason(req);
  if (fail) {
    logger.warn(`CSRF-Ablehnung von ${req.ip}: ${fail}`);
    return res.status(403).render('error', { title: 'Fehler', user: null, csrf: csrfToken(req), message: 'Ungültige Anfrage (CSRF-Schutz)' });
  }
  return next();
}

function csrfLoginCheck(req, res, next) {
  const fail = csrfFailReason(req);
  if (fail) {
    logger.warn(`CSRF-Login-Ablehnung von ${req.ip}: ${fail} -> Redirect`);
    return res.redirect('/dashboard/login?error=session');
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
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    await ensureAdminCode();
  } catch (err) {
    logger.warn(`Login-Seite: Admin-Code konnte nicht generiert/gesendet werden: ${err.message}`);
  }
  res.render('login', {
    title: 'Login',
    user: null,
    error: LOGIN_ERRORS[req.query.error] || null,
    codeError: req.query.error === 'code' || req.query.error === 'session',
    csrf: csrfToken(req),
  });
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/dashboard/login'));
}

module.exports = {
  csrfToken,
  csrfCheck,
  csrfLoginCheck,
  requireAuth,
  requireAuthApi,
  loginPage,
  logout,
  discordAuthStart,
  discordAuthCallback,
};
