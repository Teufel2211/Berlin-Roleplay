const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const logger = require('../logger');

async function getApi(req, res) {
  try {
    const guildId = req.guildId;
    const all = await settingsService.getAll(guildId);
    res.json(all);
  } catch (err) {
    logger.error(`Settings-API fehlgeschlagen: ${err.message}`);
    res.status(500).json({ error: 'Datenbank-Fehler' });
  }
}

async function applyChanges(guildId, user, settings) {
  if (!settings || typeof settings !== 'object') return;
  const before = await settingsService.getAll(guildId);
  const entries = {};
  for (const [k, v] of Object.entries(settings)) {
    if (!k.trim()) continue;
    if (Array.isArray(v)) {
      entries[k.trim()] = JSON.stringify(v.map(String).filter(Boolean));
    } else if (typeof v === 'string') {
      entries[k.trim()] = v;
    }
  }
  if (!Object.keys(entries).length) return;
  await settingsService.setMany(guildId, entries);
  const changes = {};
  for (const [k, v] of Object.entries(entries)) {
    if ((before[k] || '') !== v) {
      changes[k] = { vorher: before[k] || '', nachher: v };
    }
  }
  if (Object.keys(changes).length) {
    await auditService.log(guildId, user, 'settings.update', changes);
  }
}

async function saveApi(req, res) {
  try {
    await applyChanges(req.guildId, req.session.user.tag, req.body && req.body.settings);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Settings-API-Save fehlgeschlagen: ${err.message}`);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
}

async function saveForm(req, res) {
  try {
    await applyChanges(req.guildId, req.session.user.tag, req.body && req.body.settings);
  } catch (err) {
    logger.error(`Settings-Save fehlgeschlagen: ${err.message}`);
  }
  res.redirect(`/dashboard/servers/${req.guildId}/feature/${req.params.feature || 'overview'}`);
}

module.exports = { getApi, saveApi, saveForm };
