const { getClient, TABLES } = require('../supabase');
const logger = require('../logger');

async function log(guildId, actor, action, detail = {}) {
  try {
    const { error } = await getClient().from(TABLES.auditLog).insert({ guild_id: guildId, actor, action, detail });
    if (error) logger.error(`Audit-Eintrag fehlgeschlagen (${action}): ${error.message}`);
  } catch (err) {
    logger.error(`Audit-Eintrag fehlgeschlagen (${action}): ${err.message}`);
  }
}

module.exports = { log };
