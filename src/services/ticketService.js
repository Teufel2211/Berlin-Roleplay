const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const ticketTypeService = require('./ticketTypeService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');
const { config } = require('../config');

async function recolorMessage(channelId, messageId, color) {
  if (!channelId || !messageId) return;
  const h = { Authorization: `Bot ${config.discordToken}`, 'Content-Type': 'application/json' };
  let msg;
  try {
    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, { headers: h });
    if (!r.ok) return;
    msg = await r.json();
  } catch (e) { return; }
  const comps = Array.isArray(msg.components) ? msg.components : [];
  let changed = false;
  const next = comps.map((c) => {
    if (c && c.type === 17) { changed = true; return Object.assign({}, c, { accent_color: Number(color) || 0 }); }
    return c;
  });
  if (changed) try { await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ components: next, flags: 32768 }) }); } catch (e) {}
}

function channelNameFor(user) {
  const safe = user.username.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'nutzer';
  return `ticket-${safe}-${Date.now().toString(36)}`;
}

function channelNameForType(type, user) {
  const safeName = String(type.name || 'ticket').replace(/[^a-z0-9_-]/gi, '').slice(0, 10).toLowerCase() || 'ticket';
  const safeUser = user.username.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'nutzer';
  return `ticket-${safeName}-${safeUser}`;
}

async function openOverwrites(guild, member) {
  const settings = await settingsService.getAll(guild.id);
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  const viewAllow = { allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] };
  for (const role of helpers.resolveRoles(guild, settings.staff_roles)) overwrites.push({ id: role.id, ...viewAllow });
  for (const role of helpers.resolveRoles(guild, settings.admin_roles)) {
    if (!overwrites.some((o) => o.id === role.id)) overwrites.push({ id: role.id, ...viewAllow });
  }
  return overwrites;
}

async function handleOpen(interaction) {
  return openTicket(interaction, null);
}

async function handleTypeSelect(interaction) {
  const typeId = interaction.values && interaction.values[0];
  const type = typeId ? await ticketTypeService.get(interaction.guild.id, typeId) : null;
  if (!type) {
    return interaction.reply({
      embeds: [embeds.error('Nicht gefunden', 'Dieser Ticket-Typ existiert nicht mehr.', interaction.guild)],
      ephemeral: true,
    });
  }
  const result = await openTicket(interaction, type);
  if (interaction.message && typeof interaction.message.edit === 'function') {
    interaction.message.edit({ components: interaction.message.components }).catch(() => {});
  }
  return result;
}

async function openTicket(interaction, type) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;

  const categoryId = type ? type.category_id : settings.ticket_category_id;
  const maxOpen = type ? parseInt(type.max_open, 10) : parseInt(settings.max_open_tickets || '1', 10);

  if (!categoryId) {
    return interaction.reply({ embeds: [embeds.error('Nicht konfiguriert', 'Die Ticket-Kategorie ist noch nicht festgelegt.', guild)], ephemeral: true });
  }

  if (maxOpen > 0) {
    let query = getClient().from(TABLES.tickets).select('channel_id').eq('guild_id', gid).eq('owner_id', member.id).eq('status', 'offen');
    if (type) query = query.eq('type_id', type.id);
    const { data: existing } = await withRetry(() => query.limit(1));
    if (existing && existing.length) {
      const ch = guild.channels.cache.get(existing[0].channel_id);
      if (ch) {
        return interaction.reply({
          embeds: [embeds.error('Ticket bereits offen', type ? `Du hast bereits ein offenes **${type.name}**-Ticket: <#${ch.id}>` : `Du hast bereits ein offenes Ticket: <#${ch.id}>`, guild)],
          ephemeral: true,
        });
      }
    }
  }

  const channel = await guild.channels.create({
    name: type ? channelNameForType(type, member.user) : channelNameFor(member.user),
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: await openOverwrites(guild, member),
  });

  const { data: row, error } = await withRetry(() =>
    getClient()
      .from(TABLES.tickets)
      .insert({ guild_id: gid, channel_id: channel.id, owner_id: member.id, topic: type ? type.name : 'Support-Ticket', status: 'offen', type_id: type ? type.id : null })
      .select('*')
      .single()
  );
  if (error) {
    logger.error(`Ticket nicht gespeichert: ${error.message}`);
    await channel.delete().catch(() => null);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Das Ticket konnte nicht erstellt werden.', guild)], ephemeral: true });
  }

  const title = type ? `${type.emoji || '🎫'} ${type.name}` : '🎫 Ticket erstellt';
  const pingRoles = [];
  if (type && type.ping_role_id && guild.roles.cache.has(type.ping_role_id)) pingRoles.push(type.ping_role_id);
  for (const role of helpers.resolveRoles(guild, settings.staff_roles)) {
    if (!pingRoles.includes(role.id)) pingRoles.push(role.id);
  }
  const ping = pingRoles.length ? '\n\n' + pingRoles.map((id) => `<@&${id}>`).join(' ') : '';
  const description = type
    ? `**Nutzer:** <@${member.id}>\nDu hast ein **${type.name}**-Ticket eröffnet. Beschreibe hier dein Anliegen. Unser Team hilft dir gleich weiter.${ping}`
    : `**Nutzer:** <@${member.id}>\nBeschreibe hier dein Anliegen. Unser Team hilft dir gleich weiter.${ping}`;
  const sentMsg = await channel.send({
    embeds: [embeds.info(title, description, guild)],
    components: [helpers.row(helpers.primaryButton(`ticket_claim_${row.id}`, 'Übernehmen', '👤'), helpers.dangerButton(`ticket_close_${row.id}`, 'Ticket schließen', '🔒'))],
  });
  await withRetry(() => getClient().from(TABLES.tickets).update({ panel_message_id: String(sentMsg.id) }).eq('id', row.id));

  await auditService.log(gid, interaction.user.tag, 'ticket.open', { id: row.id, type_id: type ? type.id : null });
  return interaction.reply({ embeds: [embeds.success('Ticket erstellt', `Dein Ticket wurde geöffnet: <#${channel.id}>`, guild)], ephemeral: true });
}

async function findByChannel(interaction) {
  const gid = interaction.guild.id;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.tickets).select('*').eq('guild_id', gid).eq('channel_id', interaction.channel.id).maybeSingle()
  );
  return data;
}

async function claim(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await findByChannel(interaction);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dieser Kanal ist kein Ticket.', guild)], ephemeral: true });
  }
  if (row.claimed_by && row.claimed_by !== interaction.user.id) {
    return interaction.reply({ embeds: [embeds.error('Bereits geclaimt', `Das Ticket wird bereits von <@${row.claimed_by}> bearbeitet.`, guild)], ephemeral: true });
  }
  await withRetry(() => getClient().from(TABLES.tickets).update({ claimed_by: interaction.user.id }).eq('id', row.id));
  if (row.panel_message_id) {
    try {
      await recolorMessage(interaction.channel.id, row.panel_message_id, embeds.COLORS.success);
    } catch (e) { /* ignorieren */ }
  }
  await interaction.channel.send({ embeds: [embeds.info('🧑‍✈️ Claim', `<@${interaction.user.id}> hat das Ticket übernommen.`, guild)] });
  if (row.owner_id) {
    try {
      const owner = await guild.client.users.fetch(row.owner_id);
      await owner.send(`🧑‍✈️ Dein Ticket wird jetzt von <@${interaction.user.id}> bearbeitet.`);
    } catch (err) { logger.warn(`Claim-DM fehlgeschlagen: ${err.message}`); }
  }
  await auditService.log(gid, interaction.user.tag, 'ticket.claim', { id: row.id });
  return interaction.reply({ embeds: [embeds.success('Ticket übernommen', `Du bearbeitest jetzt <#${row.channel_id}>.`, guild)], ephemeral: true });
}

function findTicketByCustomId(interaction) {
  return Number(interaction.customId.split('_').pop());
}

async function showCloseModal(interaction) {
  const id = findTicketByCustomId(interaction);
  const modal = new ModalBuilder().setCustomId(`ticket_close_modal_${id}`).setTitle('Ticket schließen');
  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Grund (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  await interaction.showModal(modal);
}

async function handleCloseModal(interaction) {
  const id = findTicketByCustomId(interaction);
  const reason = interaction.components[0].components[0].value;
  await closeTicket(interaction, id, reason || 'Kein Grund angegeben');
}

async function closeTicket(interaction, id, reason) {
  const guild = interaction.guild;
  const gid = guild.id;
  const { data: row } = await withRetry(() =>
    getClient().from(TABLES.tickets).select('*').eq('id', Number(id)).maybeSingle()
  );
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Das Ticket existiert nicht.', guild)], ephemeral: true });
  }
  if (row.status !== 'offen') {
    return interaction.reply({ embeds: [embeds.error('Bereits geschlossen', 'Dieses Ticket ist bereits geschlossen.', guild)], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = guild.channels.cache.get(row.channel_id);
  const transcript = [];
  let transcriptText = '';
  if (channel) {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const lines = [...messages.values()].reverse().map((m) => {
        const stamp = helpers.formatDateTime(m.createdAt.toISOString());
        const text = (m.content || '(Embed/Reaktion)')
          .replace(/<@&(\d+)>/g, (mm, id) => '@' + ((guild.roles.cache.get(id) && guild.roles.cache.get(id).name) || 'Rolle'))
          .replace(/<@!?(\d+)>/g, (mm, id) => '@' + (((guild.members.cache.get(id) && guild.members.cache.get(id).user.username) || (guild.client.users.cache.get(id) && guild.client.users.cache.get(id).username)) || 'User'))
          .replace(/<#(\d+)>/g, (mm, id) => '#' + ((guild.channels.cache.get(id) && guild.channels.cache.get(id).name) || 'kanal'));
        return `[${stamp}] ${m.author.tag}: ${text}`;
      });
      transcriptText = lines.join('\n');
      transcript.push(...lines);
    } catch (err) {
      logger.warn(`Transkript konnte nicht geladen werden: ${err.message}`);
    }
  }

  let filePath = '';
  try {
    await fs.mkdir(config.transcriptDir, { recursive: true });
    filePath = path.join(config.transcriptDir, `ticket-${row.id}-${Date.now()}.txt`);
    await fs.writeFile(filePath, transcriptText || `# Ticket ${row.id}\n\n(keine Nachrichten abrufbar)`, 'utf8');
  } catch (err) {
    logger.error(`Transkript-Datei nicht geschrieben: ${err.message}`);
  }

  if ((await settingsService.get(gid, 'ticket_transcripts_enabled', 'true')) === 'true' && transcriptText) {
    await withRetry(() =>
      getClient().from(TABLES.ticketTranscripts).insert({ guild_id: gid, ticket_id: row.id, content: transcriptText })
    );
  }

  await withRetry(() =>
    getClient().from(TABLES.tickets).update({ status: 'geschlossen', close_reason: reason, closed_by: interaction.user.tag }).eq('id', row.id)
  );

  if (row.panel_message_id) {
    try {
      await recolorMessage(channel ? channel.id : null, row.panel_message_id, embeds.COLORS.error);
    } catch (e) { /* ignorieren */ }
  }

  const logChannelId = await settingsService.get(gid, 'ticket_log_channel_id');
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId);
    if (logChannel) {
      try {
        await logChannel.send({
          embeds: [embeds.info('🔒 Ticket geschlossen', `**Owner:** <@${row.owner_id}>\n**Grund:** ${reason}\n**Transkript:** \`${filePath || 'nicht gespeichert'}\``, guild)],
        });
      } catch (err) { logger.warn(`Ticket-Log fehlgeschlagen: ${err.message}`); }
    }
  }

  await auditService.log(gid, interaction.user.tag, 'ticket.close', { id: row.id, reason });

  if (channel) {
    try {
      await channel.send({ embeds: [embeds.info('🔒 Ticket geschlossen', 'Dieses Ticket wird in wenigen Sekunden gelöscht.', guild)] });
    } catch (err) { /* ignorieren */ }
    setTimeout(() => channel.delete().catch(() => null), 10 * 1000);
  }

  await interaction.editReply({ embeds: [embeds.success('Ticket geschlossen', 'Das Ticket wurde geschlossen.', guild)] });
}

module.exports = { handleOpen, handleTypeSelect, claim, showCloseModal, handleCloseModal };
