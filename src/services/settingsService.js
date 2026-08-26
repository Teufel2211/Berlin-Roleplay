const { getClient, TABLES, withRetry } = require('../supabase');
const { DEFAULT_SETTINGS } = require('../config');
const logger = require('../logger');

const guildCache = new Map();

async function ensureGuildDefaults(guildId) {
  const entries = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
    guild_id: guildId,
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));
  await withRetry(() => getClient().from(TABLES.settings).upsert(entries, { onConflict: 'guild_id,key' }));
}

async function ensureGuildLoaded(guildId, force = false) {
  if (!guildCache.has(guildId)) {
    guildCache.set(guildId, { loaded: false, cache: new Map() });
  }
  const entry = guildCache.get(guildId);
  if (entry.loaded && !force) return entry.cache;

  const { data, error } = await getClient()
    .from(TABLES.settings)
    .select('key, value')
    .eq('guild_id', guildId);
  if (error) throw error;

  if (!data || data.length === 0) {
    await ensureGuildDefaults(guildId);
  }

  const { data: reloaded } = await getClient()
    .from(TABLES.settings)
    .select('key, value')
    .eq('guild_id', guildId);
  entry.cache = new Map((reloaded || []).map((r) => [r.key, String(r.value)]));
  entry.loaded = true;
  return entry.cache;
}

async function get(guildId, key, fallback = '') {
  const cache = await ensureGuildLoaded(guildId);
  return cache.has(key) ? cache.get(key) : fallback;
}

async function getAll(guildId) {
  const cache = await ensureGuildLoaded(guildId);
  return Object.fromEntries(cache);
}

async function setMany(guildId, entries) {
  const now = new Date().toISOString();
  const { error } = await getClient()
    .from(TABLES.settings)
    .upsert(
      Object.entries(entries).map(([key, value]) => ({ guild_id: guildId, key, value: String(value), updated_at: now })),
      { onConflict: 'guild_id,key' }
    );
  if (error) throw error;
  await ensureGuildLoaded(guildId, true);
}

function invalidate(guildId) {
  if (guildId) {
    guildCache.delete(guildId);
  } else {
    guildCache.clear();
  }
}

async function set(guildId, key, value) { return setMany(guildId, { [key]: value }); }

module.exports = { get, getAll, setMany, set };
