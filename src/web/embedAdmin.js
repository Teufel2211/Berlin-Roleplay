const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const { client } = require('../discord/client');
const logger = require('../logger');
const auditService = require('../services/auditService');

const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
const DEFAULT_COLOR = 0xe8453c;

function parseColor(value) {
  if (!value) return DEFAULT_COLOR;
  const hex = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COLOR;
}

function buildEmbed(data) {
  const embed = { color: parseColor(data.color) };
  if (data.title) embed.title = String(data.title).slice(0, 256);
  if (data.description) embed.description = String(data.description).slice(0, 4096);
  if (data.image) embed.image = { url: String(data.image) };
  if (data.footer) embed.footer = { text: String(data.footer).slice(0, 2048) };
  if (data.timestamp === 'true') embed.timestamp = new Date().toISOString();
  if (Array.isArray(data.fields) && data.fields.length) {
    embed.fields = data.fields.slice(0, 25).map((f) => ({
      name: String(f.name || ' ').slice(0, 256),
      value: String(f.value || ' ').slice(0, 1024),
      inline: f.inline === true || f.inline === 'true',
    }));
  }
  return embed;
}

function buildComponents(embedId, buttons) {
  if (!Array.isArray(buttons) || !buttons.length) return [];
  const rows = [];
  let row = new ActionRowBuilder();
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const style = Number(btn.style);
    const isLink = style === BUTTON_STYLES.link;
    const b = new ButtonBuilder().setLabel(String(btn.label || '')).setStyle(isLink ? 5 : style >= 1 && style <= 4 ? style : 1);
    if (btn.emoji) {
      try { b.setEmoji(String(btn.emoji).slice(0, 100)); } catch (err) { /* ignore invalid emoji */ }
    }
    if (isLink) b.setURL(String(btn.url || 'https://example.com'));
    else b.setCustomId(`emb_${embedId}_${i}`);
    row.addComponents(b);
    if (row.components.length === 5) { rows.push(row); row = new ActionRowBuilder(); }
  }
  if (row.components.length) rows.push(row);
  return rows.slice(0, 5);
}

function parseData(row) {
  if (!row) return null;
  if (typeof row.data === 'string') {
    try { return JSON.parse(row.data); } catch (err) { return null; }
  }
  return row.data || null;
}

function normalizeStoredData(row) {
  const data = parseData(row) || {};
  if (!data.name && row.name) data.name = row.name;
  return data;
}

async function postEmbed(row) {
  const data = normalizeStoredData(row);
  const channel = await client.channels.fetch(row.channel_id);
  const msg = await channel.send({ embeds: [buildEmbed(data)], components: buildComponents(row.id, data.buttons) });
  await withRetry(() => getClient().from(TABLES.embeds).update({ message_id: msg.id, data }).eq('id', row.id));
  return msg;
}

async function editEmbed(row) {
  if (!row.message_id) throw new Error('Dieses Embed wurde noch nicht gepostet.');
  const data = normalizeStoredData(row);
  const channel = await client.channels.fetch(row.channel_id);
  const msg = await channel.messages.fetch(row.message_id);
  await msg.edit({ embeds: [buildEmbed(data)], components: buildComponents(row.id, data.buttons) });
  await withRetry(() => getClient().from(TABLES.embeds).update({ data }).eq('id', row.id));
  return msg;
}

async function deleteMessage(row) {
  if (!row.channel_id || !row.message_id) return;
  try {
    const channel = await client.channels.fetch(row.channel_id);
    const msg = await channel.messages.fetch(row.message_id);
    await msg.delete();
  } catch (err) {
    logger.warn(`Embed-Nachricht nicht gelöscht: ${err.message}`);
  }
}

function collect(body) {
  const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
  const data = {
    name: String(body.name || '').trim(),
    title: String(body.title || ''),
    description: String(body.description || ''),
    color: String(body.color_text || body.color || '').trim(),
    image: String(body.image || ''),
    footer: String(body.footer || ''),
    timestamp: body.timestamp === 'true' ? 'true' : 'false',
    fields: [],
    buttons: [],
  };
  const fieldNames = arr(body.field_name);
  const fieldValues = arr(body.field_value);
  const fieldInlines = arr(body.field_inline);
  for (let i = 0; i < fieldNames.length; i++) {
    const name = String(fieldNames[i] || '').trim();
    const value = String(fieldValues[i] || '').trim();
    if (name || value) data.fields.push({ name, value, inline: String(fieldInlines[i] || '') === 'true' });
  }
  const btnLabels = arr(body.btn_label);
  const btnStyles = arr(body.btn_style);
  const btnEmojis = arr(body.btn_emoji);
  const btnUrls = arr(body.btn_url);
  for (let i = 0; i < btnLabels.length; i++) {
    const label = String(btnLabels[i] || '').trim();
    const style = Number(btnStyles[i] || 1);
    const url = String(btnUrls[i] || '').trim();
    if (!label && style !== BUTTON_STYLES.link) continue;
    if (style === BUTTON_STYLES.link && !url) continue;
    data.buttons.push({ label, style, emoji: String(btnEmojis[i] || '').trim(), url });
  }
  return data;
}

async function saveRow(guildId, name, data, channelId, editId) {
  data.name = name;
  if (editId) {
    const { data: existing } = await withRetry(() => getClient().from(TABLES.embeds).select('*').eq('id', editId).eq('guild_id', guildId).maybeSingle());
    if (!existing) throw new Error('Embed nicht gefunden.');
    const payload = { name, data, updated_at: new Date().toISOString() };
    if (channelId) payload.channel_id = channelId;
    const { data: updated } = await withRetry(() => getClient().from(TABLES.embeds).update(payload).eq('id', editId).eq('guild_id', guildId).select().single());
    return updated;
  }
  const { data: inserted } = await withRetry(() => getClient().from(TABLES.embeds).insert({ guild_id: guildId, name, data, channel_id: channelId || null }).select().single());
  return inserted;
}

async function handleAction(req, res) {
  const guildId = req.guildId;
  const body = req.body || {};
  const action = body.action;
  const name = String(body.name || '').trim();
  const editId = body.edit_id ? Number(body.edit_id) : null;
  const redirect = `/dashboard/servers/${guildId}/feature/embeds`;
  const flash = (msg) => res.redirect(`${redirect}?msg=${encodeURIComponent(msg)}`);
  try {
    if (!name && action !== 'delete') return flash('Bitte einen Namen angeben.');
    const data = collect(body);
    const channelId = String(body.channel || '').trim();
    if (action === 'delete') {
      if (editId) {
        const { data: row } = await withRetry(() => getClient().from(TABLES.embeds).select('*').eq('id', editId).eq('guild_id', guildId).maybeSingle());
        if (row) {
          await deleteMessage(row);
          await withRetry(() => getClient().from(TABLES.embeds).delete().eq('id', editId).eq('guild_id', guildId));
          await auditService.log(guildId, req.session.user.tag, 'embeds.delete', { name: row.name });
        }
      }
      return flash('Embed gelöscht.');
    }
    if (action === 'save') {
      const row = await saveRow(guildId, name, data, channelId, editId);
      await auditService.log(guildId, req.session.user.tag, 'embeds.save', { name: row.name });
      return flash(`Embed „${row.name}“ gespeichert.`);
    }
    if (action === 'post' || action === 'update' || action === 'repost') {
      if (!channelId && !editId) return flash('Bitte einen Kanal wählen.');
      const row = await saveRow(guildId, name, data, channelId || undefined, editId);
      try {
        if (action === 'update' && row.message_id && row.channel_id && (channelId === row.channel_id || !channelId)) await editEmbed(row);
        else await postEmbed(row);
        await auditService.log(guildId, req.session.user.tag, `embeds.${action}`, { name: row.name, channel: row.channel_id });
        return flash(action === 'update' ? 'Embed aktualisiert.' : 'Embed gepostet.');
      } catch (err) {
        logger.error(`Embed-Aktion Discord fehlgeschlagen: ${err.stack || err.message}`);
        return flash(`Fehler: ${err.message}`);
      }
    }
    return flash('Unbekannte Aktion.');
  } catch (err) {
    logger.error(`Embed-Aktion fehlgeschlagen: ${err.stack || err.message}`);
    return flash(`Fehler: ${err.message}`);
  }
}

module.exports = { handleAction, parseColor, buildEmbed, buildComponents, parseData };
