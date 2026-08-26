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
const teamService = require('../services/teamService');
const moderationService = require('../services/moderationService');
const welcomeService = require('../services/welcomeService');
const auth = require('./auth');
const discordAuth = require('./discordAuth');
const webSettings = require('./settings');
const webAudit = require('./audit');
const embedAdmin = require('./embedAdmin');
const interviewAdmin = require('./interviewAdmin');
const managementAdmin = require('./managementAdmin');
const ticketAdmin = require('./ticketAdmin');
const interviewService = require('../services/interviewService');
const ticketTypeService = require('../services/ticketTypeService');
const SupabaseSessionStore = require('./sessionStore');
const discordApi = require('./discordApi');
const i18n = require('./i18n');

const settingsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 });

const CHANNEL_KEYS = [
  'verify_channel_id', 'verify_rules_channel_id', 'verify_log_channel_id', 'ticket_category_id', 'ticket_panel_channel_id', 'ticket_log_channel_id',
  'application_category_id', 'giveaway_channel_id', 'giveaway_announce_channel_id', 'warteraum_voice_channel_id',
  'warteraum_target_channel_id', 'interview_channel_id', 'moderation_log_channel_id', 'moderation_panel_channel_id', 'team_log_channel_id',
];
const ROLE_KEYS = ['staff_roles', 'admin_roles', 'verified_roles', 'warteraum_roles', 'giveaway_required_roles'];

const LABELS = {
  staff_roles: 'Staff-Rollen', admin_roles: 'Admin-Rollen', verified_roles: 'Verifizierte Rollen', warteraum_roles: 'Warteraum-Rollen',
  giveaway_required_roles: 'Pflicht-Rollen (Giveaway)', verify_channel_id: 'Verifizierungs-Kanal', verify_rules_channel_id: 'Regeln-Kanal', verify_log_channel_id: 'Verifizierungs-Log',
  ticket_category_id: 'Ticket-Kategorie', ticket_panel_channel_id: 'Ticket-Panel', ticket_log_channel_id: 'Ticket-Log',
  application_category_id: 'Bewerbungs-Kategorie', giveaway_channel_id: 'Giveaway-Kanal', giveaway_announce_channel_id: 'Gewinner-Kanal',
  warteraum_voice_channel_id: 'Warteraum-Voice', warteraum_target_channel_id: 'Ziel-Voice', interview_channel_id: 'Interview-Kanal',
  moderation_log_channel_id: 'Moderations-Log', moderation_panel_channel_id: 'Moderations-Panel', team_log_channel_id: 'Team-Log',
  interview_pass_threshold: 'Bestanden ab (Prozent)', verify_dm: 'DM nach Verifizierung',
  verify_min_account_age_days: 'Mindestalter des Discord-Accounts (Tage)',
  giveaway_default_winners: 'Standard-Gewinneranzahl', giveaway_max_tickets: 'Max. Lose pro User',
  max_open_tickets: 'Max. gleichzeitig offene Tickets', ticket_transcripts_enabled: 'Ticket-Transkripte aktivieren',
};

const FEATURES = [
  { id: 'overview', name: 'Übersicht', icon: '📊' },
  { id: 'moderation', name: 'Moderation', icon: '🛡️' },
  { id: 'security', name: 'Sicherheit', icon: '🔐' },
  { id: 'verification', name: 'Verifizierung', icon: '✅' },
  { id: 'welcome', name: 'Willkommen', icon: '👋' },
  { id: 'warteraum', name: 'Warteraum', icon: '🎧' },
  { id: 'tickets', name: 'Tickets', icon: '🎫' },
  { id: 'giveaway', name: 'Giveaway', icon: '🎉' },
  { id: 'bewerbung', name: 'Bewerbung', icon: '📝' },
  { id: 'interview', name: 'Interview', icon: '🎤' },
  { id: 'team', name: 'Team-System', icon: '👥' },
  { id: 'embeds', name: 'Embed-Builder', icon: '🖼️' },
  { id: 'audit', name: 'Audit-Log', icon: '📋' },
];

const ALWAYS_VISIBLE = ['overview', 'audit', 'moderation'];

function parseModuleList(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : null; } catch (e) { return null; }
}
function isModuleEnabled(all, moduleId) {
  const list = parseModuleList(all.enabled_modules);
  return list === null || list.includes(moduleId);
}
function enabledFeaturesFor(all) {
  return FEATURES.filter((f) => ALWAYS_VISIBLE.includes(f.id) || isModuleEnabled(all, f.id));
}

const SETTING_GROUPS = [
  { feature: 'overview', id: 'home', subgroup: 'Home', keys: ['language', 'theme', 'enabled_modules'] },
  { feature: 'verification', id: 'kanale', subgroup: 'Kanäle', keys: ['verify_channel_id', 'verify_rules_channel_id', 'verify_log_channel_id'] },
  { feature: 'verification', id: 'rollen', subgroup: 'Rollen', keys: ['verified_roles'] },
  { feature: 'verification', id: 'verhalten', subgroup: 'Verhalten', keys: ['verify_dm', 'verify_min_account_age_days'] },
  { feature: 'warteraum', id: 'rollen', subgroup: 'Rollen', keys: ['warteraum_roles'] },
  { feature: 'warteraum', id: 'kanale', subgroup: 'Kanäle', keys: ['warteraum_voice_channel_id', 'warteraum_target_channel_id'] },
  { feature: 'giveaway', id: 'kanale', subgroup: 'Kanäle', keys: ['giveaway_channel_id', 'giveaway_announce_channel_id'] },
  { feature: 'giveaway', id: 'rollen', subgroup: 'Rollen', keys: ['giveaway_required_roles'] },
  { feature: 'giveaway', id: 'verhalten', subgroup: 'Verhalten', keys: ['giveaway_default_winners', 'giveaway_max_tickets'] },
  { feature: 'tickets', id: 'kanale', subgroup: 'Kanäle', keys: ['ticket_category_id', 'ticket_panel_channel_id', 'ticket_log_channel_id'] },
  { feature: 'tickets', id: 'verhalten', subgroup: 'Verhalten', keys: ['max_open_tickets', 'ticket_transcripts_enabled'] },
  { feature: 'bewerbung', id: 'kanale', subgroup: 'Kanäle', keys: ['application_category_id'] },
  { feature: 'bewerbung', id: 'rollen', subgroup: 'Rollen', keys: ['application_role_id'] },
  { feature: 'bewerbung', id: 'verhalten', subgroup: 'Verhalten', keys: ['application_cooldown_days', 'application_staff_ping', 'application_questions'] },
  { feature: 'interview', id: 'kanale', subgroup: 'Kanäle', keys: ['interview_channel_id'] },
  { feature: 'interview', id: 'bewertung', subgroup: 'Bewertung', keys: ['interview_pass_threshold'] },
  { feature: 'team', id: 'protokoll', subgroup: 'Protokoll', keys: ['team_log_channel_id'] },
  { feature: 'moderation', id: 'panel', subgroup: 'Panel', keys: ['moderation_panel_channel_id'] },
  { feature: 'moderation', id: 'protokoll', subgroup: 'Protokoll', keys: ['moderation_log_channel_id'] },
];

const FEATURE_SECTIONS = {
  overview: [
    { id: 'uebersicht', label: 'Übersicht', kind: 'content' },
    { id: 'home', label: 'Einstellungen', kind: 'settings' },
  ],
  verification: [
    { id: 'kanale', label: 'Kanäle', kind: 'settings' },
    { id: 'rollen', label: 'Rollen', kind: 'settings' },
    { id: 'verhalten', label: 'Verhalten', kind: 'settings' },
    { id: 'nutzer', label: 'Verifizierte Nutzer', kind: 'content' },
  ],
  warteraum: [
    { id: 'rollen', label: 'Rollen', kind: 'settings' },
    { id: 'kanale', label: 'Kanäle', kind: 'settings' },
  ],
  tickets: [
    { id: 'liste', label: 'Offene Tickets', kind: 'content' },
    { id: 'typen', label: 'Kategorien', kind: 'content' },
    { id: 'panel', label: 'Panel', kind: 'content' },
    { id: 'tickets', label: 'Tickets', kind: 'content' },
    { id: 'transcripts', label: 'Transcripts', kind: 'content' },
    { id: 'protokoll', label: 'Ticket-Log', kind: 'content' },
  ],
  bewerbung: [
    { id: 'liste', label: 'Bewerbungen', kind: 'content' },
    { id: 'kanale', label: 'Kanäle', kind: 'settings' },
    { id: 'rollen', label: 'Rollen', kind: 'settings' },
    { id: 'verhalten', label: 'Verhalten', kind: 'settings' },
  ],
  giveaway: [
    { id: 'liste', label: 'Aktive Giveaways', kind: 'content' },
    { id: 'kanale', label: 'Kanäle', kind: 'settings' },
    { id: 'rollen', label: 'Rollen', kind: 'settings' },
    { id: 'verhalten', label: 'Verhalten', kind: 'settings' },
  ],
  interview: [
    { id: 'kanale', label: 'Kanäle', kind: 'settings' },
    { id: 'bewertung', label: 'Bewertung', kind: 'settings' },
    { id: 'fragen', label: 'Fragen', kind: 'content' },
    { id: 'ergebnisse', label: 'Ergebnisse', kind: 'content' },
  ],
  team: [
    { id: 'mitglieder', label: 'Mitglieder', kind: 'content' },
    { id: 'abteilungen', label: 'Abteilungen', kind: 'content' },
    { id: 'raenge', label: 'Ränge', kind: 'content' },
    { id: 'abwesenheiten', label: 'Abwesenheiten', kind: 'content' },
    { id: 'termine', label: 'Termine', kind: 'content' },
    { id: 'protokoll', label: 'Protokoll', kind: 'settings' },
  ],
  moderation: [
    { id: 'faelle', label: 'Fälle', kind: 'content' },
    { id: 'panel', label: 'Panel', kind: 'settings' },
    { id: 'protokoll', label: 'Protokoll', kind: 'settings' },
  ],
  security: [{ id: 'uebersicht', label: 'Übersicht', kind: 'content' }],
  welcome: [{ id: 'willkommen', label: 'Willkommen', kind: 'content' }],
  embeds: [{ id: 'embeds', label: 'Embeds', kind: 'content' }],
  audit: [{ id: 'eintraege', label: 'Einträge', kind: 'content' }],
};

function featureById(id) { return FEATURES.find((f) => f.id === id); }
function guildFromSession(req, guildId) { return (req.session?.guilds || []).find((g) => g.id === guildId) || null; }
function isBooleanValue(key, value) { return value === 'true' || value === 'false'; }
function settingsGroupsFor(featureId, all, t) {
  return SETTING_GROUPS.filter((g) => g.feature === featureId).map((g) => ({
    id: g.id,
    subgroup: t ? t('sub.' + g.subgroup.toLowerCase(), g.subgroup) : g.subgroup,
    fields: g.keys.map((key) => {
      const field = { key, label: t ? t('label.' + key, LABELS[key] || key) : LABELS[key] || key, value: all[key] || '', boolean: isBooleanValue(key, all[key]), type: CHANNEL_KEYS.includes(key) ? 'channel' : ROLE_KEYS.includes(key) ? 'roles' : 'text' };
      if (key === 'language') { field.type = 'select'; field.options = [{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]; }
      if (key === 'theme') { field.type = 'select'; field.options = [{ value: 'dark', label: t ? t('theme.dark') : 'Dark' }, { value: 'light', label: t ? t('theme.light') : 'Light' }]; }
      if (key === 'enabled_modules') { field.type = 'modules'; field.options = FEATURES.filter((f) => !ALWAYS_VISIBLE.includes(f.id)).map((f) => ({ value: f.id, label: t ? t('feat.' + f.id + '.name', f.name) : f.name })); const parsed = parseModuleList(all[key]); field.selected = parsed === null ? field.options.map((o) => o.value) : parsed; }
      if (key === 'application_role_id') { field.type = 'role'; }
      return field;
    }),
  }));
}
function langFromReq(req) {
  const q = req.query.lang;
  if (i18n.isSupported(q)) return q;
  const cookie = req.cookies && req.cookies.lang;
  if (i18n.isSupported(cookie)) return cookie;
  return 'de';
}
function applyLocale(res, lang) {
  res.locals.lang = lang;
  res.locals.t = i18n.makeT(lang);
}
function guildAccessCheck(req, res, next) {
  const guild = guildFromSession(req, req.params.guildId);
  if (!guild || !discordAuth.canAccessGuild(guild)) return res.status(403).render('error', { title: res.locals.t('error.title'), user: req.session.user, csrf: auth.csrfToken(req), message: res.locals.t('error.noAccess') });
  req.guildId = req.params.guildId; req.guild = guild; res.locals.guildId = req.params.guildId; res.locals.guilds = discordAuth.accessibleGuilds(req.session.guilds); res.locals.activeGuild = guild; next();
}
async function requireCanManage(req, res, next) { try { if (!(await discordAuth.canManageGuild(req.session, req.guild))) return res.status(403).render('error', { title: res.locals.t('error.title'), user: req.session.user, csrf: auth.csrfToken(req), message: res.locals.t('error.staffOnly') }); } catch (_) { return res.status(403).render('error', { title: res.locals.t('error.title'), user: req.session.user, csrf: auth.csrfToken(req), message: res.locals.t('error.staffOnly') }); } next(); }
async function syncSessionGuilds(req) {
  if (!req.session?.user) return;
  try {
    if (discordAuth.isOwner(req.session)) req.session.guilds = (await discordAuth.fetchBotGuilds()).map((g) => ({ ...g, ownerAccess: true, botInstalled: true }));
    else if (req.session.accessToken) req.session.guilds = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.accessToken}` } }).then((r) => r.json());
    req.session.guildsSyncedAt = Date.now();
  } catch (err) { logger.warn(`Server-Sync fehlgeschlagen: ${err.message}`); }
}

function landingFeatures(t) {
  const ids = ['tickets', 'giveaway'];
  return ids.map((id) => {
    const f = FEATURES.find((x) => x.id === id);
    return { id, name: t('feat.' + id + '.name', f.name), icon: f.icon, desc: t('feat.' + id + '.desc', '') };
  });
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1); app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, 'views')); app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); app.use(express.json({ limit: '150kb' })); app.use(express.urlencoded({ extended: true, limit: '150kb' })); app.use(cookieParser(config.sessionSecret));
  app.use((req, res, next) => { applyLocale(res, langFromReq(req)); next(); });
  app.use(session({ store: new SupabaseSessionStore(), secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, sameSite: 'lax', secure: config.webUrl.startsWith('https://'), maxAge: 24 * 60 * 60 * 1000 } }));
  app.use('/dashboard', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 })); app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => {
    const lang = langFromReq(req);
    if (i18n.isSupported(req.query.lang)) res.cookie('lang', req.query.lang, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 });
    applyLocale(res, lang);
    const t = res.locals.t;
    res.render('landing', { title: t('topbar.home') + ' — Emergency Hamburg Roleplay', user: req.session.user || null, csrf: auth.csrfToken(req), loggedIn: Boolean(req.session?.user), features: landingFeatures(t), featureName: (id) => t('feat.' + id + '.name', id) });
  });
  app.get('/api/status', (_, res) => res.json({ bot: client?.isReady() ? 'online' : 'offline', guilds: client?.guilds?.cache?.size || 0, uptime: Math.round(process.uptime()) }));
  app.get('/api/selfsync', auth.requireAuthApi, (_, res) => res.json(require('../services/selfsync').status()));
  app.get('/dashboard/login', auth.loginPage); app.get('/dashboard/auth/discord', auth.discordAuthStart); app.get('/dashboard/auth/discord/callback', auth.discordAuthCallback); app.post('/dashboard/logout', auth.csrfCheck, auth.logout); app.use('/dashboard', auth.requireAuth);
  app.get('/dashboard', async (req, res) => { await syncSessionGuilds(req); const guilds = discordAuth.accessibleGuilds(req.session.guilds); const botGuilds = await discordAuth.fetchBotGuilds().catch(() => []); const botIds = new Set(botGuilds.map((g) => g.id)); const withBot = guilds.map((g) => ({ ...g, botIn: botIds.has(g.id), botOnline: botIds.has(g.id) })); res.render('guilds', { title: req.session.user.isOwner ? res.locals.t('guilds.ownerTitle') : res.locals.t('guilds.title'), user: req.session.user, csrf: auth.csrfToken(req), guilds: withBot, inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.clientId}&scope=bot&permissions=0` }); });
  app.use('/dashboard/servers/:guildId', guildAccessCheck);
  app.get('/dashboard/servers/:guildId', (req, res) => res.redirect(`/dashboard/servers/${req.guildId}/feature/overview`));
  app.get('/dashboard/servers/:guildId/feature/interview/:resultId', async (req, res, next) => { const detail = await interviewService.getResultDetail(Number(req.params.resultId), req.guildId).catch(() => null); if (!detail) return next(); res.render('server', { title: `Interview-Detail — ${req.guild.name}`, user: req.session.user, csrf: auth.csrfToken(req), features: FEATURES, activeFeature: 'interview', feature: featureById('interview'), data: { detail } }); });
  app.get('/dashboard/servers/:guildId/feature/:feature', async (req, res, next) => {
    const feature = featureById(req.params.feature); if (!feature) return next(); const gid = req.guildId; const all = await settingsService.getAll(gid).catch(() => ({})); applyLocale(res, i18n.isSupported(all.language) ? all.language : langFromReq(req)); const t = res.locals.t; let discordOk = true; const channelOptions = await discordApi.fetchChannels(gid).catch(() => { discordOk = false; return []; }); const roleOptions = await discordApi.fetchRoles(gid).catch(() => { discordOk = false; return []; }); const visibleFeatures = enabledFeaturesFor(all); const base = { title: `${t('feat.' + feature.id + '.name', feature.name)} — ${req.guild.name}`, user: req.session.user, csrf: auth.csrfToken(req), features: visibleFeatures, activeFeature: feature.id, feature, guildId: gid, lang: res.locals.lang, theme: all.theme === 'light' ? 'light' : 'dark' }; const allGroups = settingsGroupsFor(feature.id, all, t); const sdata = { sections: (FEATURE_SECTIONS[feature.id] || []).map((s) => s.kind === 'settings' ? { ...s, label: t('sec.' + feature.id + '.' + s.id, s.label), groups: allGroups.filter((g) => g.id === s.id) } : { ...s, label: t('sec.' + feature.id + '.' + s.id, s.label) }), channelOptions, roleOptions, all, discordOk, flash: String(req.query.msg || '') };
    if (feature.id === 'overview') { const [tickets, apps, giveaways, team] = await Promise.all([getClient().from(TABLES.tickets).select('id', { count: 'exact' }).eq('guild_id', gid).eq('status', 'offen'), getClient().from(TABLES.applications).select('id', { count: 'exact' }).eq('guild_id', gid).eq('status', 'offen'), getClient().from(TABLES.giveaways).select('id', { count: 'exact' }).eq('guild_id', gid).eq('ended', false), getClient().from(TABLES.teamMembers).select('id', { count: 'exact' }).eq('guild_id', gid)]); const { client: discordClient } = require('../discord/client'); const botInstalled = discordClient?.isReady() ? discordClient.guilds.cache.has(gid) : true; return res.render('server', { ...base, data: { ...sdata, stats: { tickets: tickets.count || 0, applications: apps.count || 0, giveaways: giveaways.count || 0, team: team.count || 0 }, botInstalled } }); }
    if (feature.id === 'verification' || feature.id === 'tickets' || feature.id === 'bewerbung') { const table = feature.id === 'verification' ? TABLES.users : feature.id === 'tickets' ? TABLES.tickets : TABLES.applications; const { data: records } = await getClient().from(table).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(200); const ticketTypes = feature.id === 'tickets' ? await ticketTypeService.list(gid) : []; return res.render('server', { ...base, data: { ...sdata, records: records || [], ticketTypes } }); }
    if (feature.id === 'giveaway') { const { data: giveaways } = await getClient().from(TABLES.giveaways).select('*').eq('guild_id', gid).eq('ended', false).order('ends_at', { ascending: true }).limit(50); return res.render('server', { ...base, data: { ...sdata, giveaways: giveaways || [] } }); }
    if (feature.id === 'embeds') { const { data: embeds } = await getClient().from(TABLES.embeds).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(100); let edit = null; if (req.query.edit) { const { data: row } = await getClient().from(TABLES.embeds).select('*').eq('id', Number(req.query.edit)).eq('guild_id', gid).maybeSingle(); edit = row || null; } return res.render('server', { ...base, data: { ...sdata, embeds: embeds || [], edit } }); }
    if (feature.id === 'interview') { const [results, questions] = await Promise.all([interviewService.getResults(gid), interviewService.getQuestions(gid)]); return res.render('server', { ...base, data: { ...sdata, results, questions } }); }
    if (feature.id === 'team') { const [members, ranks, departments, absences, events] = await Promise.all([teamService.listMembers(gid), teamService.listRanks(gid), teamService.listDepartments(gid), teamService.listAbsences(gid), teamService.listEvents(gid)]); return res.render('server', { ...base, data: { ...sdata, members, ranks, departments, absences, events } }); }
    if (feature.id === 'moderation' || feature.id === 'security') return res.render('server', { ...base, data: { ...sdata, cases: await moderationService.getCases(gid) } });
    if (feature.id === 'welcome') return res.render('server', { ...base, data: { ...sdata, config: await welcomeService.getConfig(gid) } });
    if (feature.id === 'audit') { const { data: entries } = await getClient().from(TABLES.auditLog).select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(200); return res.render('server', { ...base, data: { ...sdata, entries: entries || [] } }); }
    return res.render('server', { ...base, data: sdata });
  });
  app.post('/dashboard/servers/:guildId/feature/embeds', settingsLimiter, requireCanManage, auth.csrfCheck, embedAdmin.handleAction); app.post('/dashboard/servers/:guildId/feature/interview/questions', settingsLimiter, requireCanManage, auth.csrfCheck, interviewAdmin.handleQuestions); app.post('/dashboard/servers/:guildId/feature/tickets/types', settingsLimiter, requireCanManage, auth.csrfCheck, ticketAdmin.handleTypes); app.post('/dashboard/servers/:guildId/feature/:feature/action', settingsLimiter, requireCanManage, auth.csrfCheck, managementAdmin.handleAction); app.post('/dashboard/servers/:guildId/feature/:feature', settingsLimiter, requireCanManage, auth.csrfCheck, webSettings.saveForm);
  app.use('/api/settings', auth.requireAuthApi, apiGuildMiddleware, requireCanManageApi); app.use('/api/audit', auth.requireAuthApi, apiGuildMiddleware); app.get('/api/settings', webSettings.getApi); app.get('/api/settings/transcript/:id', webSettings.getTranscript); app.post('/api/settings', auth.csrfCheck, webSettings.saveApi); app.get('/api/audit', webAudit.getApi); app.use((req, res) => res.status(404).render('error', { title: res.locals.t('error.title'), user: req.session.user || null, csrf: auth.csrfToken(req), message: res.locals.t('error.notFound') })); app.use((err, req, res, next) => { logger.error(`Web-Fehler: ${err.stack || err.message}`); if (res.headersSent) return next(err); res.status(500).render('error', { title: res.locals.t('error.title'), user: req.session.user || null, csrf: auth.csrfToken(req), message: res.locals.t('error.internal') }); });
  return app;
}
function apiGuildMiddleware(req, res, next) { const guildId = String(req.query.guild || (req.body && req.body.guild) || ''); const guild = guildFromSession(req, guildId); if (!guild || !discordAuth.canAccessGuild(guild)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Server.' }); req.guildId = guildId; req.guild = guild; next(); }
function requireCanManageApi(req, res, next) { discordAuth.canManageGuild(req.session, req.guild).then((ok) => ok ? next() : res.status(403).json({ error: 'Nur Staff/Admin können Einstellungen ändern.' })).catch(() => res.status(403).json({ error: 'Berechtigungsprüfung fehlgeschlagen.' })); }
function startWebServer() { const app = createApp(); const server = app.listen(config.webPort, () => logger.info(`HTTP-Server läuft auf Port ${config.webPort}`)); return server; }
module.exports = { createApp, startWebServer };