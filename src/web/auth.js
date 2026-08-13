const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { config } = require('../config');
const auditService = require('../services/auditService');
const logger = require('../logger');

const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getState(ip) {
  if (!attempts.has(ip)) attempts.set(ip, { count: 0, until: 0 });
  const s = attempts.get(ip);
  if (s.until && Date.now() >= s.until) {
    attempts.set(ip, { count: 0, until: 0 });
    return attempts.get(ip);
  }
  return s;
}

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
    return res.status(403).render('error', { title: 'Fehler', user: null, message: 'Ungültige Anfrage (CSRF-Schutz)' });
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

function loginPage(req, res) {
  const state = getState(req.ip);
  let error = null;
  if (state.until && Date.now() < state.until) {
    error = `Zu viele Fehlversuche. Bitte warte ${Math.ceil((state.until - Date.now()) / 60000)} Minute(n).`;
  } else if (req.query.error) {
    error = 'Falscher Benutzername oder falsches Passwort.';
  }
  res.render('login', { title: 'Login', user: null, error, csrf: csrfToken(req) });
}

async function login(req, res) {
  const state = getState(req.ip);
  if (state.until && Date.now() < state.until) {
    return res.redirect('/dashboard/login?lockout=1');
  }
  const { username, password } = req.body || {};
  let ok = false;
  if (username === config.dashboardUser && config.dashboardPasswordHash && password) {
    try {
      ok = await bcrypt.compare(String(password), config.dashboardPasswordHash);
    } catch (err) {
      logger.error(`bcrypt-Vergleich fehlgeschlagen: ${err.message}`);
    }
  }
  if (!ok) {
    state.count += 1;
    if (state.count >= MAX_ATTEMPTS) state.until = Date.now() + WINDOW_MS;
    await auditService.log(`IP ${req.ip}`, 'login.fail', { username });
    return res.redirect('/dashboard/login?error=1');
  }
  attempts.delete(req.ip);
  await auditService.log(username, 'login.success', {});
  req.session.regenerate((err) => {
    if (err) logger.error(`Session-Regeneration fehlgeschlagen: ${err.message}`);
    req.session.user = username;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    res.redirect('/dashboard');
  });
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/dashboard/login'));
}

module.exports = { csrfToken, csrfCheck, requireAuth, requireAuthApi, loginPage, login, logout };
