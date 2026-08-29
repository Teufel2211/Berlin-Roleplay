const { MessageFlags } = require('discord.js');
const logger = require('../logger');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const settingsService = require('./settingsService');
const auditService = require('./auditService');

const BUTTON_CUSTOM_ID = 'verification:verify';

function parseModuleList(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : null; } catch (_) { return null; }
}

function panelPayload(guild) {
  return {
    embeds: [{ title: '✅ Verifizierung', description: 'Klicke auf den Button **Verifizieren**, um deine Rolle auf dem Server zu erhalten.', color: 0x2ECC71, footer: { text: `Emergency Hamburg Roleplay • ${guild.name}` } }],
    components: [{ type: 1, components: [{ type: 2, style: 3, custom_id: BUTTON_CUSTOM_ID, label: 'Verifizieren', emoji: { name: '✅' } }] }],
  };
}

async function postPanel(guild, channelId, userTag) {
  const payload = panelPayload(guild);
  const oldMsgId = await settingsService.get(guild.id, 'verification_panel_message_id');
  const oldChannelId = await settingsService.get(guild.id, 'verification_panel_channel_id');
  let msgId;
  if (oldMsgId && oldChannelId) {
    const r = await fetch(`https://discord.com/api/v10/channels/${oldChannelId}/messages/${oldMsgId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      msgId = oldMsgId;
      if (oldChannelId !== channelId) await settingsService.setMany(guild.id, { verification_panel_channel_id: String(channelId) });
      await auditService.log(guild.id, userTag, 'verification.panel.update', { channelId, messageId: msgId });
      return msgId;
    }
  }
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Discord API ${r.status}: ${await r.text()}`);
  const msg = await r.json();
  msgId = msg.id;
  await settingsService.setMany(guild.id, { verification_panel_message_id: String(msgId), verification_panel_channel_id: String(channelId) });
  await auditService.log(guild.id, userTag, 'verification.panel.send', { channelId, messageId: msgId });
  return msgId;
}

async function handleVerifyButton(interaction) {
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ embeds: [embeds.error('Fehler', 'Diese Aktion ist nur auf einem Server möglich.', null)], flags: MessageFlags.Ephemeral }).catch(() => {});
  const all = await settingsService.getAll(guild.id).catch(() => ({}));
  const list = parseModuleList(all.enabled_modules);
  if (list !== null && !list.includes('verification')) return interaction.reply({ embeds: [embeds.error('Modul deaktiviert', 'Die Verifizierung ist auf diesem Server deaktiviert.', guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  const roles = helpers.resolveRoles(guild, String(all.verification_role || '').trim());
  if (!roles.length) return interaction.reply({ embeds: [embeds.error('Verifizierung nicht eingerichtet', 'Es ist keine Verifiziert-Rolle konfiguriert.', guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  let member = interaction.member;
  if (!member) member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.reply({ embeds: [embeds.error('Fehler', 'Mitglied konnte nicht gefunden werden.', guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  const missing = roles.filter((r) => !member.roles.cache.has(r.id));
  if (!missing.length) return interaction.reply({ embeds: [embeds.success('Bereits verifiziert', 'Du hast die Verifiziert-Rolle bereits.', guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  try {
    await member.roles.add(missing.map((r) => r.id), 'Verifiziert via Button');
    await auditService.log(guild.id, interaction.user.tag, 'verification.verify', { userId: interaction.user.id });
    return interaction.reply({ embeds: [embeds.success('Verifiziert', 'Du hast die Rolle verifiziert erhalten.', guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  } catch (err) {
    logger.warn(`Verifizierung fehlgeschlagen für ${interaction.user.id}: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', `Rolle konnte nicht vergeben werden: ${err.message}`, guild)], flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function handleButton(interaction) {
  if (interaction.customId === BUTTON_CUSTOM_ID) return handleVerifyButton(interaction);
  return null;
}

module.exports = { postPanel, handleButton, handleVerifyButton, BUTTON_CUSTOM_ID };