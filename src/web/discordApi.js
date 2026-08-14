const { config } = require('../config');

const OAUTH_BASE = 'https://discord.com/api';

function channelLabel(c) {
  switch (c.type) {
    case 0: return `# ${c.name}`;
    case 2: return `Sprachkanal: ${c.name}`;
    case 4: return `Kategorie: ${c.name}`;
    case 5: return `Ankündigungen: ${c.name}`;
    case 13: return `Bühne: ${c.name}`;
    case 15: return `Forum: ${c.name}`;
    default: return c.name;
  }
}

async function fetchChannels(guildId) {
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Kanal-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data
    .filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((c) => ({ id: c.id, label: channelLabel(c) }));
}

async function fetchRoles(guildId) {
  const res = await fetch(`${OAUTH_BASE}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Rollen-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data
    .filter((r) => r.name !== '@everyone')
    .map((r) => ({ id: r.id, name: r.name }));
}

async function sendDirectMessage(userId, content) {
  const dm = await fetch(`${OAUTH_BASE}/users/${userId}/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${config.discordToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dm.ok) throw new Error(`DM-Kanal fehlgeschlagen (${dm.status})`);
  const { id } = await dm.json();
  const msg = await fetch(`${OAUTH_BASE}/channels/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${config.discordToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!msg.ok) throw new Error(`DM-Sendung fehlgeschlagen (${msg.status})`);
}

module.exports = { fetchChannels, fetchRoles, sendDirectMessage };
