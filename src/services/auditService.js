const { getClient, TABLES } = require('../supabase');
const logger = require('../logger');

async function log(actor, action, detail = {}) {
  try {
    const { error } = await getClient().from(TABLES.auditLog).insert({ actor, action, detail });
    if (error) logger.error(`Audit-Eintrag fehlgeschlagen (${action}): ${error.message}`);
  } catch (err) {
    logger.error(`Audit-Eintrag fehlgeschlagen (${action}): ${err.message}`);
  }
}

module.exports = { log };
