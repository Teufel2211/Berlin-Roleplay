const { getClient, TABLES } = require('../supabase');
const logger = require('../logger');

let cache = new Map();
let loaded = false;

async function ensureLoaded(force = false) {
  if (loaded && !force) return;
  const { data, error } = await getClient().from(TABLES.settings).select('key, value');
  if (error) throw error;
  cache = new Map((data || []).map((r) => [r.key, String(r.value)]));
  loaded = true;
}

async function get(key, fallback = '') {
  await ensureLoaded();
  return cache.has(key) ? cache.get(key) : fallback;
}

async function getAll() {
  await ensureLoaded();
  return Object.fromEntries(cache);
}

async function setMany(entries) {
  const now = new Date().toISOString();
  const { error } = await getClient()
    .from(TABLES.settings)
    .upsert(
      Object.entries(entries).map(([key, value]) => ({ key, value: String(value), updated_at: now })),
      { onConflict: 'key' }
    );
  if (error) throw error;
  await ensureLoaded(true);
}

function invalidate() {
  loaded = false;
  cache = new Map();
}

module.exports = { get, getAll, setMany, invalidate };
