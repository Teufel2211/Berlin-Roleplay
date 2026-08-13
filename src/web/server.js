const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { config } = require('../config');
const logger = require('../logger');
const { getClient, TABLES } = require('../supabase');
const { client } = require('../discord/client');
const settingsService = require('../services/settingsService');
const countingService = require('../services/countingService');
const auth = require('./auth');
const webSettings = require('./settings');
const webAudit = require('./audit');

const SETTING_GROUPS = [
  { group: 'Rollen', keys: ['staff_role', 'admin_role', 'verified_role'] },
  { group: 'Verifizierung', keys: ['verify_channel_id', 'verify_dm', 'verify_log_channel_id'] },
  { group: 'Warteraum', keys: ['warteraum_role', 'warteraum_voice_channel_id', 'warteraum_target_channel_id'] },
  { group: 'Counting', keys: ['counting_channel_id', 'counting_decimal', 'counting_target', 'counting_milestones_enabled', 'counting_milestone_channel_id'] },
  { group: 'Giveaway', keys: ['giveaway_channel_id', 'giveaway_default_winners', 'giveaway_required_role', 'giveaway_announce_channel_id'] },
  { group: 'Tickets', keys: ['ticket_category_id', 'ticket_panel_channel_id', 'ticket_log_channel_id', 'max_open_tickets', 'ticket_transcripts_enabled'] },
  { group: 'Bewerbung', keys: ['application_category_id', 'application_cooldown_days', 'application_staff_ping', 'application_questions'] },
];

const LABELS = {
  staff_role: 'Staff-Rolle',
  admin_role: 'Admin-Rolle',
  verified_role: 'Verifizierte Rolle',
  warteraum_role: 'Warteraum-Rolle',
  verify_channel_id: 'Panel-Kanal (ID)',
  verify_dm: 'DM nach Verifizierung',
  verify_log_channel_id: 'Log-Kanal (ID)',
  warteraum_voice_channel_id: 'Warteraum-Voice-Kanal (ID)',
  warteraum_target_channel_id: 'Ziel-Voice-Kanal (ID)',
  counting_channel_id: 'Zähl-Kanal (ID)',
  counting_decimal: 'Dezimalzahlen erlauben',
  counting_target: 'Zielzahl (leer = unendlich)',
  counting_milestones_enabled: 'Meilensteine aktiv',
  counting_milestone_channel_id: 'Meilenstein-Kanal (ID)',
  giveaway_channel_id: 'Giveaway-Kanal (ID)',
  giveaway_default_winners: 'Standard-Gewinner',
  giveaway_required_role: 'Pflicht-Rolle (Name)',
  giveaway_announce_channel_id: 'Gewinner-Kanal (ID)',
  ticket_category_id: 'Ticket-Kategorie (ID)',
  ticket_panel_channel_id: 'Panel-Kanal (ID)',
  ticket_log_channel_id: 'Transkript-Log-Kanal (ID)',
  max_open_tickets: 'Max. offene Tickets',
  ticket_transcripts_enabled: 'Transkripte in DB sichern',
  application_category_id: 'Bewerbungs-Kategorie (ID)',
  application_cooldown_days: 'Cooldown (Tage)',
  application_staff_ping: 'Staff-Ping bei Bewerbung',
  application_questions: 'Eigene Fragen (JSON)',
};

function isBooleanValue(key, value) {
  return value === 'true' || value === 'false';
}

function startWebServer() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser(config.sessionSecret));
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.webUrl.startsWith('https://'),
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );
  app.use('/dashboard', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => res.redirect('/dashboard'));
  app.get('/api/status', (req, res) =>
    res.json({
      bot: client && client.isReady() ? 'online' : 'offline',
      guilds: client && client.guilds ? client.guilds.cache.size : 0,
      uptime: Math.round(process.uptime()),
    })
  );

  app.get('/dashboard/login', auth.loginPage);
  app.post('/dashboard/login', auth.csrfCheck, auth.login);
  app.post('/dashboard/logout', auth.csrfCheck, auth.logout);

  app.use('/dashboard', auth.requireAuth);

  app.get('/dashboard', async (req, res) => {
    try {
      const [tickets, apps, giveaways] = await Promise.all([
        getClient().from(TABLES.tickets).select('id', { count: 'exact' }).eq('status', 'offen'),
        getClient().from(TABLES.applications).select('id', { count: 'exact' }).eq('status', 'offen'),
        getClient().from(TABLES.giveaways).select('id', { count: 'exact' }).eq('ended', false),
      ]);
      const cs = await countingService.getState().catch(() => null);
      res.render('dashboard', {
        title: 'Übersicht',
        user: req.session.user,
        csrf: auth.csrfToken(req),
        stats: {
          tickets: tickets.count || 0,
          applications: apps.count || 0,
          giveaways: giveaways.count || 0,
          currentNumber: cs ? cs.current_number : 0,
          streak: cs ? cs.streak : 0,
        },
        botOnline: client && client.isReady(),
        webUrl: config.webUrl,
      });
    } catch (err) {
      logger.error(`Dashboard fehlgeschlagen: ${err.message}`);
      res.render('dashboard', {
        title: 'Übersicht',
        user: req.session.user,
        csrf: auth.csrfToken(req),
        stats: { tickets: '-', applications: '-', giveaways: '-', currentNumber: '-', streak: '-' },
        botOnline: false,
        webUrl: config.webUrl,
        dbError: 'Datenbank nicht erreichbar.',
      });
    }
  });

  app.get('/dashboard/settings', async (req, res) => {
    const all = await settingsService.getAll().catch(() => ({}));
    const groups = SETTING_GROUPS.map((g) => ({
      group: g.group,
      fields: g.keys.map((key) => ({
        key,
        label: LABELS[key] || key,
        value: all[key] || '',
        boolean: isBooleanValue(key, all[key]),
      })),
    }));
    res.render('settings', { title: 'Einstellungen', user: req.session.user, csrf: auth.csrfToken(req), groups });
  });
  app.post('/dashboard/settings', webSettings.saveForm);

  app.get('/dashboard/audit', async (req, res) => {
    try {
      const { data } = await getClient().from(TABLES.auditLog).select('*').order('created_at', { ascending: false }).limit(200);
      res.render('audit', { title: 'Audit-Log', user: req.session.user, csrf: auth.csrfToken(req), entries: data || [] });
    } catch (err) {
      res.render('audit', { title: 'Audit-Log', user: req.session.user, csrf: auth.csrfToken(req), entries: [], dbError: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/dashboard/verification', async (req, res) => {
    try {
      const { data } = await getClient().from(TABLES.users).select('*').order('verified_at', { ascending: false }).limit(200);
      res.render('verification', { title: 'Verifizierung', user: req.session.user, csrf: auth.csrfToken(req), users: data || [] });
    } catch (err) {
      res.render('verification', { title: 'Verifizierung', user: req.session.user, csrf: auth.csrfToken(req), users: [], dbError: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/dashboard/tickets', async (req, res) => {
    try {
      const { data } = await getClient().from(TABLES.tickets).select('*').order('created_at', { ascending: false }).limit(200);
      res.render('tickets', { title: 'Tickets', user: req.session.user, csrf: auth.csrfToken(req), tickets: data || [] });
    } catch (err) {
      res.render('tickets', { title: 'Tickets', user: req.session.user, csrf: auth.csrfToken(req), tickets: [], dbError: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/dashboard/tickets/:id', async (req, res) => {
    try {
      const { data: ticket } = await getClient().from(TABLES.tickets).select('*').eq('id', req.params.id).maybeSingle();
      const { data: transcript } = ticket
        ? await getClient().from(TABLES.ticketTranscripts).select('content').eq('ticket_id', ticket.id).maybeSingle()
        : { data: null };
      res.render('ticket_detail', {
        title: 'Ticket-Detail',
        user: req.session.user,
        csrf: auth.csrfToken(req),
        ticket,
        transcript: transcript ? transcript.content : null,
      });
    } catch (err) {
      res.render('ticket_detail', { title: 'Ticket-Detail', user: req.session.user, csrf: auth.csrfToken(req), ticket: null, transcript: null, dbError: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/dashboard/applications', async (req, res) => {
    try {
      const { data } = await getClient().from(TABLES.applications).select('*').order('created_at', { ascending: false }).limit(200);
      res.render('applications', { title: 'Bewerbungen', user: req.session.user, csrf: auth.csrfToken(req), applications: data || [] });
    } catch (err) {
      res.render('applications', { title: 'Bewerbungen', user: req.session.user, csrf: auth.csrfToken(req), applications: [], dbError: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/api/settings', auth.requireAuthApi, webSettings.getApi);
  app.post('/api/settings', auth.requireAuthApi, auth.csrfCheck, webSettings.saveApi);
  app.get('/api/audit', auth.requireAuthApi, webAudit.getApi);

  app.use((req, res) => res.status(404).render('error', { title: 'Fehler', user: null, message: 'Seite nicht gefunden' }));
  app.use((err, req, res, next) => {
    logger.error(`Web-Fehler: ${err.stack || err.message}`);
    if (res.headersSent) return next(err);
    res.status(500).render('error', { title: 'Fehler', user: null, message: 'Interner Fehler' });
  });

  const server = app.listen(config.webPort, () => {
    logger.info(`HTTP-Server läuft auf Port ${config.webPort}`);
  });
  return server;
}

module.exports = { startWebServer };
