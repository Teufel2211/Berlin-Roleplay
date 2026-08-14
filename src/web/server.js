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
const discordAuth = require('./discordAuth');
const webSettings = require('./settings');
const webAudit = require('./audit');
const embedAdmin = require('./embedAdmin');
const interviewAdmin = require('./interviewAdmin');
const interviewService = require('../services/interviewService');
const SupabaseSessionStore = require('./sessionStore');
const discordApi = require('./discordApi');

const settingsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });

const CHANNEL_KEYS = [
  'verify_channel_id', 'verify_log_channel_id', 'counting_channel_id', 'counting_milestone_channel_id',
  'ticket_category_id', 'ticket_panel_channel_id', 'ticket_log_channel_id', 'application_category_id',
  'giveaway_channel_id', 'giveaway_announce_channel_id', 'warteraum_voice_channel_id', 'warteraum_target_channel_id',
  'interview_channel_id',
];

const ROLE_KEYS = ['staff_roles', 'admin_roles', 'verified_roles', 'warteraum_roles', 'giveaway_required_roles'];

const LABELS = {
  staff_roles: 'Staff-Rollen',
  admin_roles: 'Admin-Rollen',
  verified_roles: 'Verifizierte Rollen',
  warteraum_roles: 'Warteraum-Rollen',
  giveaway_required_roles: 'Pflicht-Rollen (Giveaway)',
  verify_channel_id: 'Panel-Kanal',
  verify_dm: 'DM nach Verifizierung',
  verify_log_channel_id: 'Log-Kanal',
  warteraum_voice_channel_id: 'Warteraum-Voice-Kanal',
  warteraum_target_channel_id: 'Ziel-Voice-Kanal',
  counting_channel_id: 'Zähl-Kanal',
  counting_decimal: 'Dezimalzahlen erlauben',
  counting_target: 'Zielzahl (leer = unendlich)',
  counting_milestones_enabled: 'Meilensteine aktiv',
  counting_milestone_channel_id: 'Meilenstein-Kanal',
  giveaway_channel_id: 'Giveaway-Kanal',
  giveaway_default_winners: 'Standard-Gewinner',
  giveaway_announce_channel_id: 'Gewinner-Kanal',
  ticket_category_id: 'Ticket-Kategorie',
  ticket_panel_channel_id: 'Panel-Kanal',
  ticket_log_channel_id: 'Transkript-Log-Kanal',
  max_open_tickets: 'Max. offene Tickets',
  ticket_transcripts_enabled: 'Transkripte in DB sichern',
  application_category_id: 'Bewerbungs-Kategorie',
  application_cooldown_days: 'Cooldown (Tage)',
  application_staff_ping: 'Staff-Ping bei Bewerbung',
  application_questions: 'Eigene Fragen (JSON)',
  interview_channel_id: 'Interview-Kanal',
  interview_max_per_section: 'Max. Fragen pro Abschnitt',
  interview_pass_threshold: 'Bestanden ab Punktzahl',
};

const FEATURES = [
  { id: 'overview', name: 'Übersicht', icon: '📊' },
  { id: 'verification', name: 'Verifizierung', icon: '✅' },
  { id: 'warteraum', name: 'Warteraum', icon: '🎧' },
  { id: 'counting', name: 'Counting', icon: '🔢' },
  { id: 'giveaway', name: 'Giveaway', icon: '🎉' },
  { id: 'tickets', name: 'Tickets', icon: '🎫' },
  { id: 'bewerbung', name: 'Bewerbung', icon: '📝' },
  { id: 'interview', name: 'Interview', icon: '🎤' },
  { id: 'embeds', name: 'Embed-Builder', icon: '🖼️' },
  { id: 'audit', name: 'Audit-Log', icon: '🛡️' },
];

const SETTING_GROUPS = [
  { feature: 'verification', subgroup: 'Kanäle', keys: ['verify_channel_id', 'verify_log_channel_id'] },
  { feature: 'verification', subgroup: 'Rollen', keys: ['verified_roles'] },
  { feature: 'verification', subgroup: 'Verhalten', keys: ['verify_dm'] },
  { feature: 'warteraum', subgroup: 'Rollen', keys: ['warteraum_roles'] },
  { feature: 'warteraum', subgroup: 'Kanäle', keys: ['warteraum_voice_channel_id', 'warteraum_target_channel_id'] },
  { feature: 'counting', subgroup: 'Kanäle', keys: ['counting_channel_id', 'counting_milestone_channel_id'] },
  { feature: 'counting', subgroup: 'Verhalten', keys: ['counting_decimal', 'counting_target', 'counting_milestones_enabled'] },
  { feature: 'giveaway', subgroup: 'Kanäle', keys: ['giveaway_channel_id', 'giveaway_announce_channel_id'] },
  { feature: 'giveaway', subgroup: 'Rollen', keys: ['giveaway_required_roles'] },
  { feature: 'giveaway', subgroup: 'Verhalten', keys: ['giveaway_default_winners'] },
  { feature: 'tickets', subgroup: 'Kanäle', keys: ['ticket_category_id', 'ticket_panel_channel_id', 'ticket_log_channel_id'] },
  { feature: 'tickets', subgroup: 'Verhalten', keys: ['max_open_tickets', 'ticket_transcripts_enabled'] },
  { feature: 'bewerbung', subgroup: 'Kanäle', keys: ['application_category_id'] },
  { feature: 'bewerbung', subgroup: 'Verhalten', keys: ['application_cooldown_days', 'application_staff_ping', 'application_questions'] },
  { feature: 'interview', subgroup: 'Kanäle', keys: ['interview_channel_id'] },
  { feature: 'interview', subgroup: 'Bewertung', keys: ['interview_max_per_section', 'interview_pass_threshold'] },
  { feature: 'audit', subgroup: 'Allgemein', keys: ['staff_roles', 'admin_roles'] },
];

function isBooleanValue(key, value) {
  return value === 'true' || value === 'false';
}

function featureById(id) {
  return FEATURES.find((f) => f.id === id);
}

function settingsGroupsFor(featureId, all, channelOptions, roleOptions) {
  return SETTING_GROUPS.filter((g) => g.feature === featureId).map((g) => ({
    subgroup: g.subgroup,
    fields: g.keys.map((key) => ({
      key,
      label: LABELS[key] || key,
      value: all[key] || '',
      boolean: isBooleanValue(key, all[key]),
      type: CHANNEL_KEYS.includes(key) ? 'channel' : ROLE_KEYS.includes(key) ? 'roles' : 'text',
    })),
  }));
}

function guildFromSession(req, guildId) {
  const guilds = req.session && req.session.guilds ? req.session.guilds : [];
  return guilds.find((g) => g.id === guildId) || null;
}

function guildAccessCheck(req, res, next) {
  const guildId = req.params.guildId;
  const guild = guildFromSession(req, guildId);
  if (!guild || !discordAuth.canAccessGuild(guild)) {
    return res.status(403).render('error', { title: 'Fehler', user: req.session.user, csrf: auth.csrfToken(req), message: 'Kein Zugriff auf diesen Server.' });
  }
  req.guildId = guildId;
  req.guild = guild;
  res.locals.guildId = guildId;
  res.locals.guilds = discordAuth.accessibleGuilds(req.session.guilds);
  res.locals.activeGuild = guild;
  return next();
}

async function requireCanManage(req, res, next) {
  try {
    const ok = await discordAuth.canManageGuild(req.session, req.guild);
    if (!ok) {
      return res.status(403).render('error', { title: 'Fehler', user: req.session.user, csrf: auth.csrfToken(req), message: 'Nur Staff/Admin können Einstellungen ändern.' });
    }
    return next();
  } catch (err) {
    logger.warn(`canManageGuild-Check fehlgeschlagen: ${err.message}`);
    return next();
  }
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser(config.sessionSecret));
  app.use(
    session({
      store: new SupabaseSessionStore(),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.webUrl.startsWith('https://'),
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );
  app.use('/dashboard', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    const loggedIn = Boolean(req.session && req.session.user);
    res.render('landing', { title: 'Emergency Hamburg Roleplay Dashboard', user: req.session.user || null, csrf: auth.csrfToken(req), loggedIn });
  });

  app.get('/api/status', (req, res) =>
    res.json({
      bot: client && client.isReady() ? 'online' : 'offline',
      guilds: client && client.guilds ? client.guilds.cache.size : 0,
      uptime: Math.round(process.uptime()),
    })
  );

  app.get('/dashboard/login', auth.loginPage);
  app.get('/dashboard/auth/discord', auth.discordAuthStart);
  app.get('/dashboard/auth/discord/callback', auth.discordAuthCallback);
  app.post('/dashboard/logout', auth.csrfCheck, auth.logout);

  app.use('/dashboard', auth.requireAuth);

  app.get('/dashboard', async (req, res) => {
    const guilds = discordAuth.accessibleGuilds(req.session.guilds);
    const withBot = guilds.map((g) => ({
      ...g,
      botIn: Boolean(client && client.guilds.cache.has(g.id)),
      botOnline: Boolean(client && client.isReady() && client.guilds.cache.has(g.id)),
    }));
    res.render('guilds', {
      title: 'Server wählen',
      user: req.session.user,
      csrf: auth.csrfToken(req),
      guilds: withBot,
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.clientId}&scope=bot&permissions=0`,
    });
  });

  app.use('/dashboard/servers/:guildId', guildAccessCheck);

  app.get('/dashboard/servers/:guildId', (req, res) => res.redirect(`/dashboard/servers/${req.guildId}/feature/overview`));

  app.get('/dashboard/servers/:guildId/feature/interview/:resultId', async (req, res, next) => {
    const gid = req.guildId;
    const feature = featureById('interview');
    const detail = await interviewService.getResultDetail(Number(req.params.resultId), gid).catch(() => null);
    if (!detail) return next();
    const all = await settingsService.getAll(gid).catch(() => ({}));
    return res.render('server', {
      title: 'Interview-Detail — ' + req.guild.name,
      user: req.session.user,
      csrf: auth.csrfToken(req),
      features: FEATURES,
      activeFeature: 'interview',
      feature,
      data: { detail, all },
    });
  });

  app.get('/dashboard/servers/:guildId/feature/:feature', async (req, res, next) => {
    const gid = req.guildId;
    const feature = featureById(req.params.feature);
    if (!feature) return next();

    const base = {
      title: `${feature.name} — ${req.guild.name}`,
      user: req.session.user,
      csrf: auth.csrfToken(req),
      features: FEATURES,
      activeFeature: feature.id,
      feature,
    };

    let all = {};
    try {
      all = await settingsService.getAll(gid);
    } catch (err) {
      logger.warn(`Settings nicht verfügbar: ${err.message}`);
    }
    const hasGroups = SETTING_GROUPS.some((g) => g.feature === feature.id);
    let channelOptions = null;
    let roleOptions = null;
    if (hasGroups) {
      try {
        [channelOptions, roleOptions] = await Promise.all([discordApi.fetchChannels(gid), discordApi.fetchRoles(gid)]);
      } catch (err) {
        logger.warn(`Discord-Optionen nicht verfügbar: ${err.message}`);
      }
    }
    const groups = settingsGroupsFor(feature.id, all, channelOptions, roleOptions);
    const sdata = { groups, channelOptions, roleOptions, all };

    if (feature.id === 'audit') {
      try {
        const { data } = await getClient().from(TABLES.auditLog).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(200);
        return res.render('server', { ...base, data: { ...sdata, entries: data || [] } });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, entries: [], dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'verification' || feature.id === 'tickets' || feature.id === 'bewerbung') {
      try {
        const query =
          feature.id === 'verification'
            ? getClient().from(TABLES.users).select('*').eq('guild_id', gid).order('verified_at', { ascending: false }).limit(200)
            : feature.id === 'tickets'
            ? getClient().from(TABLES.tickets).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(200)
            : getClient().from(TABLES.applications).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(200);
        const { data } = await query;
        return res.render('server', { ...base, data: { ...sdata, records: data || [] } });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, records: [], dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'giveaway') {
      try {
        const { data } = await getClient().from(TABLES.giveaways).select('*').eq('guild_id', gid).eq('ended', false).order('ends_at', { ascending: true }).limit(50);
        return res.render('server', { ...base, data: { ...sdata, giveaways: data || [] } });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, giveaways: [], dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'counting') {
      try {
        const cs = await countingService.getState(gid);
        const { data: top } = await getClient().from(TABLES.countingStats).select('discord_id, count').eq('guild_id', gid).order('count', { ascending: false }).limit(10);
        return res.render('server', { ...base, data: { ...sdata, state: cs, top: top || [] } });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, state: null, top: [], dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'embeds') {
      try {
        const { data: embeds } = await getClient().from(TABLES.embeds).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(100);
        let edit = null;
        if (req.query.edit) {
          const { data: row } = await getClient().from(TABLES.embeds).select('*').eq('id', Number(req.query.edit)).eq('guild_id', gid).maybeSingle();
          edit = row || null;
        }
        let channelOptions = null;
        try { channelOptions = await discordApi.fetchChannels(gid); } catch (err) { logger.warn(`Kanaloptionen nicht verfügbar: ${err.message}`); }
        return res.render('server', { ...base, data: { embeds: embeds || [], edit, channelOptions, flash: String(req.query.msg || '') } });
      } catch (err) {
        return res.render('server', { ...base, data: { embeds: [], edit: null, channelOptions: null, flash: String(req.query.msg || ''), dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'interview') {
      try {
        const [results, questions] = await Promise.all([interviewService.getResults(gid), interviewService.getQuestions(gid)]);
        return res.render('server', { ...base, data: { ...sdata, results, questions } });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, results: [], questions: [], dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    if (feature.id === 'overview') {
      try {
        const [tickets, apps, giveaways] = await Promise.all([
          getClient().from(TABLES.tickets).select('id', { count: 'exact' }).eq('guild_id', gid).eq('status', 'offen'),
          getClient().from(TABLES.applications).select('id', { count: 'exact' }).eq('guild_id', gid).eq('status', 'offen'),
          getClient().from(TABLES.giveaways).select('id', { count: 'exact' }).eq('guild_id', gid).eq('ended', false),
        ]);
        const cs = await countingService.getState(gid).catch(() => null);
        return res.render('server', {
          ...base,
          data: {
            ...sdata,
            stats: {
              tickets: tickets.count || 0,
              applications: apps.count || 0,
              giveaways: giveaways.count || 0,
              currentNumber: cs ? cs.current_number : 0,
              streak: cs ? cs.streak : 0,
            },
            botOnline: Boolean(client && client.isReady() && client.guilds.cache.has(gid)),
          },
        });
      } catch (err) {
        return res.render('server', { ...base, data: { ...sdata, stats: { tickets: '-', applications: '-', giveaways: '-', currentNumber: '-', streak: '-' }, botOnline: false, dbError: 'Datenbank nicht erreichbar.' } });
      }
    }

    return res.render('server', { ...base, data: sdata });
  });

  app.post('/dashboard/servers/:guildId/feature/embeds', settingsLimiter, requireCanManage, auth.csrfCheck, embedAdmin.handleAction);
  app.post('/dashboard/servers/:guildId/feature/interview/questions', settingsLimiter, requireCanManage, auth.csrfCheck, interviewAdmin.handleQuestions);
  app.post('/dashboard/servers/:guildId/feature/:feature', settingsLimiter, requireCanManage, auth.csrfCheck, webSettings.saveForm);

  app.use('/api/settings', auth.requireAuthApi, apiGuildMiddleware, requireCanManageApi);
  app.use('/api/audit', auth.requireAuthApi, apiGuildMiddleware);
  app.get('/api/settings', webSettings.getApi);
  app.post('/api/settings', auth.csrfCheck, webSettings.saveApi);
  app.get('/api/audit', webAudit.getApi);

  app.use((req, res) => res.status(404).render('error', { title: 'Fehler', user: null, csrf: auth.csrfToken(req), message: 'Seite nicht gefunden' }));
  app.use((err, req, res, next) => {
    logger.error(`Web-Fehler: ${err.stack || err.message}`);
    if (res.headersSent) return next(err);
    res.status(500).render('error', { title: 'Fehler', user: null, csrf: auth.csrfToken(req), message: 'Interner Fehler' });
  });

  return app;
}

function apiGuildMiddleware(req, res, next) {
  const guildId = String(req.query.guild || (req.body && req.body.guild) || '');
  const guild = guildFromSession(req, guildId);
  if (!guild || !discordAuth.canAccessGuild(guild)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Server.' });
  }
  req.guildId = guildId;
  req.guild = guild;
  return next();
}

function requireCanManageApi(req, res, next) {
  discordAuth
    .canManageGuild(req.session, req.guild)
    .then((ok) => {
      if (!ok) return res.status(403).json({ error: 'Nur Staff/Admin können Einstellungen ändern.' });
      return next();
    })
    .catch(() => next());
}

function startWebServer() {
  const app = createApp();
  const server = app.listen(config.webPort, () => {
    logger.info(`HTTP-Server läuft auf Port ${config.webPort}`);
  });
  return server;
}

module.exports = { createApp, startWebServer };
