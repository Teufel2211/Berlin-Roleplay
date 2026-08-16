const { getClient, TABLES, withRetry } = require('../supabase');
const embeds = require('../discord/embeds');
const logger = require('../logger');

const MAX_EMBED_FIELDS = 25;

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderTemplate(value, member) {
  const members = member.guild.members.cache;
  const userCount = members.filter((m) => !m.user.bot).size;
  const botCount = members.filter((m) => m.user.bot).size;
  return String(value || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{member_count}', String(member.guild.memberCount))
    .replaceAll('{join_date}', formatDate(member.joinedAt) || formatDate(Date.now()))
    .replaceAll('{user_count}', String(userCount))
    .replaceAll('{bot_count}', String(botCount));
}

function addFields(embed, data, member) {
  const fields = Array.isArray(data.fields) ? data.fields : [];
  if (!fields.length) return;
  let added = 0;
  for (const field of fields) {
    if (added >= MAX_EMBED_FIELDS) {
      logger.warn(`Welcome: mehr als ${MAX_EMBED_FIELDS} Embed-Felder konfiguriert, Rest verworfen.`);
      break;
    }
    const name = renderTemplate(field && field.name, member);
    const value = renderTemplate(field && field.value, member);
    if (!name || !value) continue;
    embed.addFields({ name, value, inline: Boolean(field && field.inline) });
    added += 1;
  }
}

async function getConfig(guildId) {
  const { data } = await withRetry(() => getClient().from(TABLES.welcomeMessages).select('*').eq('guild_id', guildId).maybeSingle());
  return data || null;
}

async function saveConfig(guildId, payload) {
  const { data, error } = await withRetry(() => getClient().from(TABLES.welcomeMessages).upsert({ guild_id: guildId, ...payload }, { onConflict: 'guild_id' }).select().single());
  if (error) throw error;
  return data;
}

async function handleMemberJoin(member) {
  const cfg = await getConfig(member.guild.id);
  if (!cfg || !cfg.enabled || !cfg.channel_id) return;
  const channel = member.guild.channels.cache.get(cfg.channel_id);
  if (!channel || !channel.isTextBased()) return;

  const data = cfg.embed_data || {};
  const title = renderTemplate(data.title || 'Willkommen!', member);
  const description = renderTemplate(data.description || 'Willkommen auf {server}, {user}!', member);
  const embed = embeds.info(title, description, member.guild);
  if (data.color) {
    try { embed.setColor(data.color); } catch (_) {}
  }
  if (data.image) embed.setImage(renderTemplate(data.image, member));
  if (data.thumbnail) embed.setThumbnail(renderTemplate(data.thumbnail, member));
  addFields(embed, data, member);
  await channel.send({ embeds: [embed] });

  if (cfg.dm_enabled) {
    const dmEmbed = embeds.info(title, description, member.guild);
    if (data.color) {
      try { dmEmbed.setColor(data.color); } catch (_) {}
    }
    if (data.image) dmEmbed.setImage(renderTemplate(data.image, member));
    if (data.thumbnail) dmEmbed.setThumbnail(renderTemplate(data.thumbnail, member));
    addFields(dmEmbed, data, member);
    try { await member.send({ embeds: [dmEmbed] }); } catch (_) {}
  }

  const roleIds = Array.isArray(cfg.auto_role_ids) ? cfg.auto_role_ids : [];
  const roles = roleIds.map((id) => member.guild.roles.cache.get(id)).filter(Boolean);
  if (roles.length) {
    try { await member.roles.add(roles); } catch (_) {}
  }
}

module.exports = { getConfig, saveConfig, handleMemberJoin };
