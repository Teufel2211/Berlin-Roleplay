const { getClient, TABLES, withRetry } = require('../supabase');
const embeds = require('../discord/embeds');

function renderTemplate(value, member) {
  return String(value || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{member_count}', String(member.guild.memberCount));
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
  await channel.send({ embeds: [embed] });

  if (cfg.dm_enabled) {
    try { await member.send({ embeds: [embeds.info(title, description, member.guild)] }); } catch (_) {}
  }

  const roleIds = Array.isArray(cfg.auto_role_ids) ? cfg.auto_role_ids : [];
  const roles = roleIds.map((id) => member.guild.roles.cache.get(id)).filter(Boolean);
  if (roles.length) {
    try { await member.roles.add(roles); } catch (_) {}
  }
}

module.exports = { getConfig, saveConfig, handleMemberJoin };
