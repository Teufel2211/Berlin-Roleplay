const { getClient, TABLES, withRetry } = require('../supabase');

async function list(guildId) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.ticketTypes).select('*').eq('guild_id', guildId).order('sort', { ascending: true }));
  if (error) throw error;
  return data || [];
}

async function get(guildId, id) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.ticketTypes).select('*').eq('id', Number(id)).eq('guild_id', guildId).maybeSingle());
  if (error) throw error;
  return data || null;
}

async function create(guildId, payload) {
  const { data: last } = await withRetry(() => getClient().from(TABLES.ticketTypes).select('sort').eq('guild_id', guildId).order('sort', { ascending: false }).limit(1));
  const sort = (last && last[0] ? last[0].sort : 0) + 1;
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.ticketTypes).insert({ guild_id: guildId, sort, ...payload }).select().single()
  );
  if (error) throw error;
  return data;
}

async function update(guildId, id, payload) {
  const { data, error } = await withRetry(() =>
    getClient().from(TABLES.ticketTypes).update(payload).eq('id', Number(id)).eq('guild_id', guildId).select().single()
  );
  if (error) throw error;
  return data;
}

async function remove(guildId, id) {
  const { error } = await withRetry(() => getClient().from(TABLES.ticketTypes).delete().eq('id', Number(id)).eq('guild_id', guildId));
  if (error) throw error;
}

async function move(guildId, id, dir) {
  const { data: current } = await withRetry(() => getClient().from(TABLES.ticketTypes).select('*').eq('id', Number(id)).eq('guild_id', guildId).maybeSingle());
  if (!current) return;
  const { data: peers } = await withRetry(() => getClient().from(TABLES.ticketTypes).select('*').eq('guild_id', guildId).order('sort', { ascending: true }));
  const list = peers || [];
  const idx = list.findIndex((t) => t.id === current.id);
  const target = idx + (dir === 'down' ? 1 : -1);
  if (idx !== -1 && target >= 0 && target < list.length) {
    const a = list[idx];
    const b = list[target];
    await withRetry(() => getClient().from(TABLES.ticketTypes).update({ sort: b.sort }).eq('id', a.id).eq('guild_id', guildId));
    await withRetry(() => getClient().from(TABLES.ticketTypes).update({ sort: a.sort }).eq('id', b.id).eq('guild_id', guildId));
  }
}

module.exports = { list, get, create, update, remove, move };
