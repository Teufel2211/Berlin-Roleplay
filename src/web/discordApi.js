const { config } = require('../config');

const OAUTH_BASE = 'https://discord.com/api';
const CACHE_TTL = 60 * 1000;
const REQUEST_TIMEOUT = 5000;
const cache = new Map();

function channelLabel(c) {
  switch (c.type) {
    case 0: return `# ${c.name}`;
    case 2: return `🔊 ${c.name}`;
    case 4: return `📁 ${c.name}`;
    case 5: return `📢 ${c.name}`;
    case 13: return `🎙️ ${c.name}`;
    case 15: return `💬 ${c.name}`;
    default: return c.name;
  }
}

function authHeaders() {
  if (!config.discordToken) throw new Error('DISCORD_TOKEN fehlt');
  return { Authorization: `Bot ${config.discordToken}` };
}

async function discordFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { headers: authHeaders(), signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Discord-API Timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function cached(key) {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.value;
}

function store(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
  return value;
}

async function fetchChannels(guildId, { force = false } = {}) {
  const key = `channels:${guildId}`;
  if (!force) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const res = await discordFetch(`${OAUTH_BASE}/guilds/${guildId}/channels`);
  if (!res.ok) throw new Error(`Kanal-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return store(key, data
    .filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((c) => ({ id: c.id, name: channelLabel(c), type: c.type, rawName: c.name })));
}

async function fetchRoles(guildId, { force = false } = {}) {
  const key = `roles:${guildId}`;
  if (!force) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const res = await discordFetch(`${OAUTH_BASE}/guilds/${guildId}/roles`);
  if (!res.ok) throw new Error(`Rollen-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return store(key, data
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((r) => ({ id: r.id, name: r.name, position: r.position })));
}

function invalidateGuild(guildId) {
  cache.delete(`channels:${guildId}`);
  cache.delete(`roles:${guildId}`);
}

function clearCache() {
  cache.clear();
}

async function postMessage(channelId, payload) {
  const res = await discordFetch(`${OAUTH_BASE}/channels/${channelId}/messages`, { method: 'POST' });
  if (!res.ok) throw new Error(`Nachricht konnte nicht gesendet werden (${res.status})`);
  return res.json();
}

async function editMessage(channelId, messageId, payload) {
  const res = await fetch(`${OAUTH_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Nachricht konnte nicht aktualisiert werden (${res.status})`);
  return res.json();
}

async function deleteMessage(channelId, messageId) {
  const res = await discordFetch(`${OAUTH_BASE}/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Nachricht konnte nicht gelöscht werden (${res.status})`);
}

async function sendDirectMessage(userId, content) {
  const dm = await fetch(`${OAUTH_BASE}/users/${userId}/channels`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dm.ok) throw new Error(`DM-Kanal fehlgeschlagen (${dm.status})`);
  const { id } = await dm.json();
  const msg = await fetch(`${OAUTH_BASE}/channels/${id}/messages`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!msg.ok) throw new Error(`DM-Sendung fehlgeschlagen (${msg.status})`);
}

module.exports = {
  fetchChannels,
  fetchRoles,
  invalidateGuild,
  clearCache,
  sendDirectMessage,
  postMessage,
  editMessage,
  deleteMessage,
};
