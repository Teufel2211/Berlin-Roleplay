const { getClient, TABLES } = require('../supabase');
const logger = require('../logger');

async function getApi(req, res) {
  try {
    const { data } = await getClient()
      .from(TABLES.auditLog)
      .select('*')
      .eq('guild_id', req.guildId)
      .order('created_at', { ascending: false })
      .limit(200);
    res.json(data || []);
  } catch (err) {
    logger.error(`Audit-API fehlgeschlagen: ${err.message}`);
    res.status(500).json({ error: 'Datenbank-Fehler' });
  }
}

module.exports = { getApi };
