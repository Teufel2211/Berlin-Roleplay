const { getClient, TABLES, withRetry } = require('../supabase');

async function listMembers(guildId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamMembers).select('*').eq('guild_id', guildId).order('joined_at', { ascending: true }));
  if (error) throw error;
  return data || [];
}

async function getMember(guildId, discordId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamMembers).select('*').eq('guild_id', guildId).eq('discord_id', discordId).maybeSingle());
  if (error) throw error;
  return data || null;
}

async function upsertMember(guildId, discordId, data = {}) {
  const row = { guild_id: guildId, discord_id: discordId, ...data };
  const { data: saved, error } = await withRetry(() => getClient().from(TABLES.teamMembers).upsert(row, { onConflict: 'guild_id,discord_id' }).select().single());
  if (error) throw error;
  return saved;
}

async function removeMember(guildId, discordId) {
  const { error } = await withRetry(() => getClient().from(TABLES.teamMembers).delete().eq('guild_id', guildId).eq('discord_id', discordId));
  if (error) throw error;
}

async function promoteMember(guildId, discordId, rankId, departmentId = null) {
  const existing = await getMember(guildId, discordId);
  if (!existing) throw new Error('Teammitglied nicht gefunden.');
  return upsertMember(guildId, discordId, {
    rank_id: rankId ? Number(rankId) : null,
    department_id: departmentId ? Number(departmentId) : existing.department_id,
    status: existing.status || 'aktiv',
  });
}

async function listEvents(guildId, from = new Date().toISOString()) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamEvents).select('*').eq('guild_id', guildId).gte('starts_at', from).order('starts_at', { ascending: true }).limit(100));
  if (error) throw error;
  return data || [];
}

async function createEvent(guildId, payload) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamEvents).insert({ guild_id: guildId, ...payload }).select().single());
  if (error) throw error;
  return data;
}

async function removeEvent(guildId, id) {
  const { error } = await withRetry(() => getClient().from(TABLES.teamEvents).delete().eq('guild_id', guildId).eq('id', Number(id)));
  if (error) throw error;
}

async function addAbsence(guildId, payload) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamAbsences).insert({ guild_id: guildId, ...payload }).select().single());
  if (error) throw error;
  return data;
}

async function removeAbsence(guildId, id) {
  const { error } = await withRetry(() => getClient().from(TABLES.teamAbsences).delete().eq('guild_id', guildId).eq('id', Number(id)));
  if (error) throw error;
}

async function listAbsences(guildId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamAbsences).select('*').eq('guild_id', guildId).order('starts_at', { ascending: true }).limit(200));
  if (error) throw error;
  return data || [];
}

async function listDepartments(guildId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamDepartments).select('*').eq('guild_id', guildId).order('sort', { ascending: true }));
  if (error) throw error;
  return data || [];
}

async function listRanks(guildId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.teamRanks).select('*').eq('guild_id', guildId).order('sort', { ascending: true }));
  if (error) throw error;
  return data || [];
}

module.exports = {
  listMembers,
  getMember,
  upsertMember,
  removeMember,
  promoteMember,
  listEvents,
  createEvent,
  removeEvent,
  addAbsence,
  removeAbsence,
  listAbsences,
  listDepartments,
  listRanks,
};
