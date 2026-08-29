const { getClient, TABLES, withRetry } = require('../supabase');
const logger = require('../logger');

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
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.moderationWarnings).select('*').eq('guild_id', guildId).eq('target_id', targetId).order('created_at', { ascending: false })
  );
  if (error) throw error;
  return data || [];
}

async function getWarningById(guildId, warningId) {
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.moderationWarnings).select('*').eq('id', warningId).eq('guild_id', guildId).maybeSingle()
  );
  if (error) throw error;
  return data || null;
}

async function getCases(guildId, limit = 100) {
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.moderationCases).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(limit)
  );
  if (error) throw error;
  return data || [];
}

async function deleteWarning(guildId, warningId) {
  const { error } = await withRetry(() =>
    getClient().from(TABLES.moderationWarnings).delete().eq('id', warningId).eq('guild_id', guildId)
  );
  if (error) throw error;
}

async function getWarningCount(guildId, targetId) {
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.moderationWarnings).select('points').eq('guild_id', guildId).eq('target_id', targetId)
  );
  if (error) throw error;
  return (data || []).reduce((sum, w) => sum + (w.points || 1), 0);
}

async function clearMessages(channel, limit) {
  let deleted = 0;
  let remaining = limit;
  while (remaining > 0) {
    const batch = Math.min(remaining, 100);
    const fetched = await channel.messages.fetch({ limit: batch });
    if (fetched.size === 0) break;
    const deletedMsgs = await channel.bulkDelete(fetched, true);
    deleted += deletedMsgs.size;
    remaining -= fetched.size;
  }
  return deleted;
}

module.exports = { logCase, warn, getWarnings, getWarningById, getCases, deleteWarning, getWarningCount, clearMessages };
