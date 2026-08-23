const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const logger = require('../logger');
const ticketService = require('../services/proTicketService');
const { getClient, TABLES, withRetry } = require('../supabase');

async function getApi(req, res) {
  try {
    const guildId = req.guildId;
    if (req.query.ticket === '1') {
      const [ticketSettings, categories, priorities, tags, stats, tickets, transcripts] = await Promise.all([
        ticketService.settings(guildId), ticketService.categories(guildId, true), ticketService.priorities(guildId), ticketService.tags(guildId),
        ticketService.stats(guildId), ticketService.list(guildId, { status: req.query.status || '', categoryId: req.query.category || '', assigned: req.query.assigned || '', priorityId: req.query.priority || '', searchText: req.query.search || '', offset: Number(req.query.offset || 0) }),
        ticketService.transcripts(guildId, { ticketId: req.query.ticketId || '', userId: req.query.userId || '' }),
      ]);
      const { data: events } = await withRetry(() => getClient().from(TABLES.ticketEvents).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(100));
      return res.json({ settings: ticketSettings, categories, priorities, tags, stats, tickets, transcripts, events: events || [] });
    }
    const all = await settingsService.getAll(guildId);
    res.json(all);
  } catch (err) {
    logger.error(`Settings-API fehlgeschlagen: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Datenbank-Fehler' });
  }
}

async function applyChanges(guildId, user, settings) {
  if (!settings || typeof settings !== 'object') return;
  const before = await settingsService.getAll(guildId);
  const entries = {};
  for (const [k, v] of Object.entries(settings)) {
    if (!k.trim()) continue;
    entries[k.trim()] = Array.isArray(v) ? JSON.stringify(v.map(String).filter(Boolean)) : String(v ?? '');
  }
  if (!Object.keys(entries).length) return;
  await settingsService.setMany(guildId, entries);
  const changes = {};
  for (const [k, v] of Object.entries(entries)) if ((before[k] || '') !== v) changes[k] = { vorher: before[k] || '', nachher: v };
  if (Object.keys(changes).length) await auditService.log(guildId, user, 'settings.update', changes);
}

async function ticketAction(req, guildId, user) {
  const a = req.body && req.body.ticketAction;
  const body = req.body && req.body.ticket;
  if (!a) return false;
  if (a === 'settings') await ticketService.saveSettings(guildId, body || {});
  else if (a === 'category_save') await ticketService.upsertCategory(guildId, body || {});
  else if (a === 'category_delete') await ticketService.deleteCategory(guildId, Number(body.id));
  else if (a === 'priority_save') { const row = { guild_id: guildId, name: String(body.name || 'Priorität'), emoji: String(body.emoji || '🔵'), color: Number(body.color || 5793266), sort_order: Number(body.sort_order || 0), enabled: body.enabled !== false }; if (body.id) await withRetry(() => getClient().from(TABLES.ticketPriorities).update(row).eq('guild_id', guildId).eq('id', Number(body.id))); else await withRetry(() => getClient().from(TABLES.ticketPriorities).insert(row)); }
  else if (a === 'tag_save') { const row = { guild_id: guildId, name: String(body.name || 'Tag'), emoji: String(body.emoji || '🏷️'), color: Number(body.color || 8421504), description: String(body.description || '') || null, enabled: body.enabled !== false }; if (body.id) await withRetry(() => getClient().from(TABLES.ticketTags).update(row).eq('guild_id', guildId).eq('id', Number(body.id))); else await withRetry(() => getClient().from(TABLES.ticketTags).insert(row)); }
  else if (a === 'question_save') { const row = { guild_id: guildId, category_id: Number(body.category_id), question: String(body.question || '').slice(0, 1000), type: ['short','long','choice','boolean','number'].includes(body.type) ? body.type : 'short', options: Array.isArray(body.options) ? body.options : String(body.options || '').split('\n').filter(Boolean), required: body.required !== false, sort_order: Number(body.sort_order || 0), enabled: body.enabled !== false }; if (body.id) await withRetry(() => getClient().from(TABLES.ticketQuestions).update(row).eq('guild_id', guildId).eq('id', Number(body.id))); else await withRetry(() => getClient().from(TABLES.ticketQuestions).insert(row)); }
  else if (a === 'question_delete') await withRetry(() => getClient().from(TABLES.ticketQuestions).delete().eq('guild_id', guildId).eq('id', Number(body.id)));
  await auditService.log(guildId, user, `ticket.${a}`, body || {});
  return true;
}

async function saveApi(req, res) {
  try {
    if (req.body && req.body.ticketAction) { await ticketAction(req, req.guildId, req.session.user.tag); return res.json({ ok: true }); }
    await applyChanges(req.guildId, req.session.user.tag, req.body && req.body.settings);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Settings-API-Save fehlgeschlagen: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
}

async function saveForm(req, res) {
  try { await applyChanges(req.guildId, req.session.user.tag, req.body && req.body.settings); }
  catch (err) { logger.error(`Settings-Save fehlgeschlagen: ${err.message}`); }
  res.redirect(`/dashboard/servers/${req.guildId}/feature/${req.params.feature || 'overview'}`);
}

module.exports = { getApi, saveApi, saveForm };
