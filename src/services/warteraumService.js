const { getClient, TABLES, withRetry } = require('../supabase');
const logger = require('../logger');

async function cleanupMember(guildId, memberId) {
  try {
    await withRetry(() => getClient().from(TABLES.warteraum).delete().eq('guild_id', guildId).eq('discord_id', memberId));
  } catch (err) {
    logger.error(`Warteraum-Cleanup fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { cleanupMember };
