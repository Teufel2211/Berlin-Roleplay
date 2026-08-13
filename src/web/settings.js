const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const logger = require('../logger');

async function getApi(req, res) {
  try {
    const all = await settingsService.getAll();
    res.json(all);
  } catch (err) {
    logger.error(`Settings-API fehlgeschlagen: ${err.message}`);
    res.status(500).json({ error: 'Datenbank-Fehler' });
  }
}

async function applyChanges(user, settings) {
  if (!settings || typeof settings !== 'object') return;
  const before = await settingsService.getAll();
  const entries = {};
  for (const [k, v] of Object.entries(settings)) {
    if (typeof v === 'string' && k.trim()) entries[k.trim()] = v;
  }
  if (!Object.keys(entries).length) return;
  await settingsService.setMany(entries);
  const changes = {};
  for (const [k, v] of Object.entries(entries)) {
    if ((before[k] || '') !== v) {
      changes[k] = k === 'admin_code'
        ? { vorher: before[k] ? '***' : '', nachher: v ? '***' : '' }
        : { vorher: before[k] || '', nachher: v };
    }
  }
  if (Object.keys(changes).length) {
    await auditService.log(user, 'settings.update', changes);
  }
}

async function saveApi(req, res) {
  try {
    await applyChanges(req.session.user, req.body && req.body.settings);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Settings-API-Save fehlgeschlagen: ${err.message}`);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
}

async function saveForm(req, res) {
  try {
    await applyChanges(req.session.user, req.body && req.body.settings);
  } catch (err) {
    logger.error(`Settings-Save fehlgeschlagen: ${err.message}`);
  }
  res.redirect('/dashboard/settings');
}

module.exports = { getApi, saveApi, saveForm };
