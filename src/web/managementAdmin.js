const { getClient, TABLES, withRetry } = require('../supabase');
const auditService = require('../services/auditService');

async function handleAction(req, res) {
  const guildId = req.guildId;
  const feature = req.params.feature;
  const body = req.body || {};
  const redirect = `/dashboard/servers/${guildId}/feature/${feature}`;

  try {
    if (feature === 'moderation' && body.action === 'clear_warning' && body.id) await withRetry(() => getClient().from(TABLES.moderationWarnings).delete().eq('id', Number(body.id)).eq('guild_id', guildId));
  } catch (err) {
    return res.redirect(`${redirect}?msg=${encodeURIComponent(`Fehler: ${err.message}`)}`);
  }
  return res.redirect(`${redirect}?msg=${encodeURIComponent('Gespeichert')}`);
}

module.exports = { handleAction };
