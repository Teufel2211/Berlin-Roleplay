const { getClient, TABLES, withRetry } = require('../supabase');

async function logCase(guildId, targetId, moderatorId, action, reason, durationSeconds = null) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.moderationCases).insert({
    guild_id: guildId,
    target_id: targetId,
    moderator_id: moderatorId,
    action,
    reason,
    duration_seconds: durationSeconds,
  }).select().single());
  if (error) throw error;
  return data;
}

async function warn(guildId, targetId, moderatorId, reason, points = 1, expiresAt = null) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.moderationWarnings).insert({
    guild_id: guildId,
    target_id: targetId,
    moderator_id: moderatorId,
    reason,
    points,
    expires_at: expiresAt,
  }).select().single());
  if (error) throw error;
  return data;
}

async function getWarnings(guildId, targetId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.moderationWarnings).select('*').eq('guild_id', guildId).eq('target_id', targetId).order('created_at', { ascending: false }));
  if (error) throw error;
  return data || [];
}

async function getCases(guildId, limit = 100) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.moderationCases).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(limit));
  if (error) throw error;
  return data || [];
}

module.exports = { logCase, warn, getWarnings, getCases };
