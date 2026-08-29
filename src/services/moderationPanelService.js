const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const logger = require('../logger');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const moderationService = require('./moderationService');
const settingsService = require('./settingsService');
const auditService = require('./auditService');

const BUTTON_ACTIONS = [
  { id: 'ban', label: 'Ban', emoji: '🔨', style: 4 },
  { id: 'kick', label: 'Kick', emoji: '👢', style: 1 },
  { id: 'softban', label: 'Softban', emoji: '🌀', style: 1 },
  { id: 'warn', label: 'Warn', emoji: '⚠️', style: 2 },
  { id: 'unban', label: 'Unban', emoji: '✅', style: 3 },
  { id: 'clear', label: 'Clear', emoji: '🗑️', style: 1 },
];

const ACTION_LABELS = { ban: '🔨 Ban', kick: '👢 Kick', softban: '🌀 Softban', warn: '⚠️ Warn', unban: '✅ Unban', clear: '🗑️ Clear' };

const SELECT_OPTIONS = [
  { label: 'Ban', value: 'ban', description: 'Nutzer dauerhaft vom Server entfernen', emoji: { name: '🔨' } },
  { label: 'Kick', value: 'kick', description: 'Nutzer vom Server kicken', emoji: { name: '👢' } },
  { label: 'Softban', value: 'softban', description: 'Ban + letzte 7 Tage Nachrichten löschen', emoji: { name: '🌀' } },
  { label: 'Warn', value: 'warn', description: 'Verwarnung mit Punkten erteilen', emoji: { name: '⚠️' } },
  { label: 'Unban', value: 'unban', description: 'Ban eines Nutzers aufheben', emoji: { name: '✅' } },
  { label: 'Clear', value: 'clear', description: 'Nachrichten aus dem Kanal löschen', emoji: { name: '🗑️' } },
];

function panelComponents() {
  const children = [];
  children.push({ type: 10, content: '## 🛡️ Moderation-Panel' });
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 10, content: 'Wähle eine Aktion aus dem Dropdown-Menü aus, um sie durchzuführen.\n\n🔨 **Ban** — Nutzer dauerhaft entfernen\n👢 **Kick** — Nutzer vom Server kicken\n🌀 **Softban** — Ban + Nachrichten löschen\n⚠️ **Warn** — Verwarnung erteilen\n✅ **Unban** — Ban aufheben\n🗑️ **Clear** — Nachrichten löschen' });
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 1, components: [{ type: 3, custom_id: 'mod_panel:select', placeholder: 'Aktion wählen…', options: SELECT_OPTIONS, min_values: 1, max_values: 1 }] });
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 10, content: '-# Emergency Hamburg Roleplay' });
  return [{ type: 17, accent_color: 0x2B3A67, components: children }];
}

async function postPanel(guild, channelId, userTag) {
  const payload = { flags: 32768, components: panelComponents() };
  const oldMsgId = await settingsService.get(guild.id, 'moderation_panel_message_id');
  const oldChannelId = await settingsService.get(guild.id, 'moderation_panel_channel_id');
  let msgId;
  if (oldMsgId && oldChannelId) {
    const r = await fetch(`https://discord.com/api/v10/channels/${oldChannelId}/messages/${oldMsgId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      msgId = oldMsgId;
      if (oldChannelId !== channelId) {
        await settingsService.setMany(guild.id, { moderation_panel_channel_id: String(channelId) });
      }
      await auditService.log(guild.id, userTag, 'moderation.panel.update', { channelId, messageId: msgId });
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
  await settingsService.setMany(guild.id, { moderation_panel_message_id: String(msgId), moderation_panel_channel_id: String(channelId) });
  await auditService.log(guild.id, userTag, 'moderation.panel.send', { channelId, messageId: msgId });
  return msgId;
}

function buildModal(action) {
  const isUnban = action === 'unban';
  const isClear = action === 'clear';
  const title = `${ACTION_LABELS[action]} — Aktion`;
  const modal = new ModalBuilder().setCustomId(`mod_modal:${action}`).setTitle(title);
  const userIdInput = new TextInputBuilder().setCustomId('user_id').setLabel(isUnban ? 'User-ID' : isClear ? 'User-ID (optional)' : 'User-ID').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(!isClear);
  const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Grund').setPlaceholder('Grund angeben...').setStyle(TextInputStyle.Paragraph).setRequired(action !== 'clear');
  modal.addComponents(new ActionRowBuilder().addComponents(userIdInput), new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

async function handleButton(interaction) {
  const action = interaction.customId.split(':')[1];
  if (!BUTTON_ACTIONS.find((a) => a.id === action)) return;
  const modal = buildModal(action);
  await interaction.showModal(modal);
  await resetPanelSelect(interaction.guild).catch((e) => logger.warn(`Moderation-Panel-Reset: ${e.message}`));
}

async function handleSelect(interaction) {
  const action = interaction.values?.[0];
  if (!action || !BUTTON_ACTIONS.find((a) => a.id === action)) return;
  const modal = buildModal(action);
  await interaction.showModal(modal);
  await resetPanelSelect(interaction.guild).catch((e) => logger.warn(`Moderation-Panel-Reset: ${e.message}`));
}

async function resetPanelSelect(guild) {
  const panelMsgId = await settingsService.get(guild.id, 'moderation_panel_message_id');
  const panelChannelId = await settingsService.get(guild.id, 'moderation_panel_channel_id');
  if (!panelMsgId || !panelChannelId) return;
  const url = `https://discord.com/api/v10/channels/${panelChannelId}/messages/${panelMsgId}`;
  const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
  const patch = (components) => fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ components }) });
  const disabled = panelComponents();
  const row = disabled[0].components.find((c) => c.type === 1);
  const select = row && row.components.find((c) => c.type === 3);
  if (select) select.disabled = true;
  const ok = await patch(disabled).then((r) => r.ok);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const ok2 = await patch(panelComponents()).then((r) => r.ok);
  if (!ok || !ok2) logger.warn(`Moderation-Panel-Reset fehlgeschlagen (disable=${ok}, restore=${ok2})`);
}

async function logModeration(guild, moderator, action, target, reason, extra = {}) {
  try {
    await moderationService.logCase(guild.id, target.id || target, moderator.id, action, reason, extra.duration || null);
    const logChannelId = await settingsService.get(guild.id, 'moderation_log_channel_id');
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    const emoji = { ban: '🔨', unban: '✅', kick: '👢', softban: '🌀', warn: '⚠️', clear: '🗑️' }[action] || '🛡️';
    const targetId = target.id || target;
    const fields = [
      `**Nutzer:** <@${targetId}>`,
      `**Moderator:** <@${moderator.id}>`,
      `**Grund:** ${reason || 'Kein Grund angegeben'}`,
    ];
    if (extra.duration) fields.push(`**Dauer:** ${formatDuration(extra.duration)}`);
    if (extra.count) fields.push(`**Nachrichten:** ${extra.count}`);
    const embed = embeds.v2({
      color: action === 'ban' || action === 'kick' ? embeds.COLORS.error : action === 'warn' ? embeds.COLORS.warning : embeds.COLORS.info,
      title: `${emoji} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      description: fields.join('\n'),
      guild,
    });
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Moderations-Log fehlgeschlagen: ${err.message}`);
  }
}

function formatDuration(seconds) {
  if (!seconds) return 'Unbegrenzt';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || 'Unbegrenzt';
}

async function handleModal(interaction) {
  const action = interaction.customId.split(':')[1];
  if (!BUTTON_ACTIONS.find((a) => a.id === action)) return;

  const userId = interaction.fields.getTextInputValue('user_id')?.trim();
  const reason = interaction.fields.getTextInputValue('reason')?.trim() || 'Kein Grund angegeben';
  const guild = interaction.guild;
  const member = interaction.member;
  const gid = guild.id;

  const settings = await settingsService.getAll(gid);
  if (!helpers.isGuildAdmin(member, settings) && !helpers.isGuildModerator(member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Du hast keine Berechtigung.', guild)], flags: 64 });
  }

  await interaction.deferReply();

  try {
    switch (action) {
      case 'ban': {
        const target = await guild.members.fetch(userId).catch(() => null);
        if (target) {
          if (target.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
            return interaction.editReply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang bannen.', guild)] });
          }
          if (!target.bannable) {
            return interaction.editReply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden.', guild)] });
          }
        }
        try {
          const targetUser = await guild.members.fetch(userId).catch(() => null);
          const userObj = targetUser?.user || { id: userId, tag: userId };
          await userObj.send?.({ embeds: [embeds.warning('🔨 Gebannt', `Du wurdest von **${guild.name}** gebannt.\n**Grund:** ${reason}`, guild)] }).catch(() => {});
        } catch (_) {}
        await guild.members.ban(userId, { reason: `${reason} (von ${interaction.user.tag})` });
        await logModeration(guild, interaction.user, 'ban', { id: userId }, reason);
        return interaction.editReply({ embeds: [embeds.success('🔨 Gebannt', `<@${userId}> wurde gebannt.\n**Grund:** ${reason}`, guild)] });
      }
      case 'kick': {
        const target = await guild.members.fetch(userId).catch(() => null);
        if (!target) {
          return interaction.editReply({ embeds: [embeds.error('Nicht gefunden', 'Dieser Nutzer ist nicht auf dem Server.', guild)] });
        }
        if (target.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
          return interaction.editReply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang kicken.', guild)] });
        }
        if (!target.kickable) {
          return interaction.editReply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gekickt werden.', guild)] });
        }
        try {
          await target.user.send({ embeds: [embeds.warning('👢 Gekickt', `Du wurdest von **${guild.name}** gekickt.\n**Grund:** ${reason}`, guild)] }).catch(() => {});
        } catch (_) {}
        await target.kick(`${reason} (von ${interaction.user.tag})`);
        await logModeration(guild, interaction.user, 'kick', { id: userId }, reason);
        return interaction.editReply({ embeds: [embeds.success('👢 Gekickt', `<@${userId}> wurde gekickt.\n**Grund:** ${reason}`, guild)] });
      }
      case 'softban': {
        const target = await guild.members.fetch(userId).catch(() => null);
        if (target) {
          if (target.roles.highest.position >= member.roles.highest.position && guild.ownerId !== member.id) {
            return interaction.editReply({ embeds: [embeds.error('Fehler', 'Du kannst keinen Nutzer mit gleichem oder höherem Rang softbannen.', guild)] });
          }
          if (!target.bannable) {
            return interaction.editReply({ embeds: [embeds.error('Fehler', 'Dieser Nutzer kann nicht gebannt werden.', guild)] });
          }
        }
        try {
          const userObj = target?.user || { id: userId };
          await userObj.send?.({ embeds: [embeds.warning('🌀 Softban', `Du wurdest von **${guild.name}** gesoftbannent.\n**Grund:** ${reason}`, guild)] }).catch(() => {});
        } catch (_) {}
        await guild.members.ban(userId, { deleteMessageSeconds: 7 * 86400, reason: `Softban: ${reason} (von ${interaction.user.tag})` });
        await guild.members.unban(userId, 'Softban: automatische Entbannt');
        await logModeration(guild, interaction.user, 'softban', { id: userId }, reason);
        return interaction.editReply({ embeds: [embeds.success('🌀 Softban', `<@${userId}> wurde gesoftbannent.\n**Grund:** ${reason}`, guild)] });
      }
      case 'warn': {
        if (!userId) {
          return interaction.editReply({ embeds: [embeds.error('Fehler', 'User-ID ist erforderlich.', guild)] });
        }
        await moderationService.warn(gid, userId, interaction.user.id, reason, 1);
        const totalPoints = await moderationService.getWarningCount(gid, userId);
        await logModeration(guild, interaction.user, 'warn', { id: userId }, reason);
        try {
          const targetMember = await guild.members.fetch(userId).catch(() => null);
          await targetMember?.user?.send({ embeds: [embeds.warning('⚠️ Verwarnung', `Du wurdest auf **${guild.name}** verwarnet.\n**Grund:** ${reason}\n**Gesamtpunkte:** ${totalPoints}`, guild)] }).catch(() => {});
        } catch (_) {}
        return interaction.editReply({ embeds: [embeds.success('⚠️ Verwarnung', `<@${userId}> wurde verwarnet.\n**Grund:** ${reason}\n**Gesamtpunkte:** ${totalPoints}`, guild)] });
      }
      case 'unban': {
        try {
          await guild.bans.fetch(userId);
        } catch (_) {
          return interaction.editReply({ embeds: [embeds.error('Nicht gebannt', 'Dieser Nutzer ist nicht gebannt.', guild)] });
        }
        await guild.members.unban(userId, `${reason} (von ${interaction.user.tag})`);
        await logModeration(guild, interaction.user, 'unban', { id: userId }, reason);
        return interaction.editReply({ embeds: [embeds.success('✅ Entbannt', `<@${userId}> wurde entbannt.\n**Grund:** ${reason}`, guild)] });
      }
      case 'clear': {
        if (!interaction.channel.isTextBased()) {
          return interaction.editReply({ embeds: [embeds.error('Fehler', 'Dieser Befehl kann nur in Textkanälen verwendet werden.', guild)] });
        }
        let deleted = 0;
        if (userId) {
          let remaining = 100;
          while (remaining > 0) {
            const batch = Math.min(remaining, 100);
            const fetched = await interaction.channel.messages.fetch({ limit: batch });
            if (fetched.size === 0) break;
            const filtered = fetched.filter((m) => m.author.id === userId);
            if (filtered.size === 0) break;
            const deletedMsgs = await interaction.channel.bulkDelete(filtered, true);
            deleted += deletedMsgs.size;
            remaining -= fetched.size;
          }
        } else {
          deleted = await moderationService.clearMessages(interaction.channel, 100);
        }
        await logModeration(guild, interaction.user, 'clear', { id: interaction.user.id, tag: interaction.user.tag }, `${userId ? `<@${userId}>: ` : ''}${deleted} Nachrichten gelöscht`, { count: deleted });
        return interaction.editReply({ embeds: [embeds.success('🗑️ Gelöscht', `${deleted} Nachrichten wurden gelöscht.${userId ? ` (Nur von <@${userId}>)` : ''}`, guild)] });
      }
      default:
        return interaction.editReply({ embeds: [embeds.error('Unbekannt', 'Unbekannte Aktion.', guild)] });
    }
  } catch (err) {
    logger.error(`Moderations-Panel fehlgeschlagen: ${err.message}`);
    return interaction.editReply({ embeds: [embeds.error('Fehler', `Aktion fehlgeschlagen: ${err.message}`, guild)] });
  } finally {
    await resetPanelSelect(guild).catch((e) => logger.warn(`Moderation-Panel-Reset: ${e.message}`));
  }
}

module.exports = { postPanel, panelComponents, handleButton, handleSelect, handleModal, BUTTON_ACTIONS, ACTION_LABELS };
