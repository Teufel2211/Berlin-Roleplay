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

async function fetchChannels() {
  const res = await fetch(`${OAUTH_BASE}/guilds/${config.guildId}/channels`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Kanal-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data
    .filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((c) => ({ id: c.id, label: channelLabel(c) }));
}

async function fetchRoles() {
  const res = await fetch(`${OAUTH_BASE}/guilds/${config.guildId}/roles`, {
    headers: { Authorization: `Bot ${config.discordToken}` },
  });
  if (!res.ok) throw new Error(`Rollen-Abruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data
    .filter((r) => r.name !== '@everyone')
    .map((r) => ({ id: r.id, name: r.name }));
}

module.exports = { fetchChannels, fetchRoles };
