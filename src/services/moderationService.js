const { getClient, TABLES, withRetry } = require('../supabase');

async function getCases(guildId, limit = 100) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.moderationCases).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(limit));
  if (error) throw error;
  return data || [];
}

module.exports = { getCases };
