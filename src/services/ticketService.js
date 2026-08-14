const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');
const { config } = require('../config');

function channelNameFor(user) {
  const safe = user.username.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'nutzer';
  return `ticket-${safe}-${Date.now().toString(36)}`;
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

async function postPanel(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const channelId = await settingsService.get(gid, 'ticket_panel_channel_id');
  if (!channelId) {
    return interaction.reply({
      embeds: [embeds.error('Kein Panel-Kanal', 'Setze `ticket_panel_channel_id` im Dashboard, bevor du das Panel postest.', guild)],
      ephemeral: true,
    });
  }
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ embeds: [embeds.error('Kanal nicht gefunden', 'Der konfigurierte Panel-Kanal existiert nicht mehr.', guild)], ephemeral: true });
  }
  const panel = embeds.info('🎫 Support-Ticket', 'Klicke auf **Ticket öffnen**, um ein Support-Ticket zu erstellen.', guild);
  const row = helpers.row(helpers.primaryButton('ticket_panel', 'Ticket öffnen', '🎫'));
  const msg = await channel.send({ embeds: [panel], components: [row] });
  await settingsService.setMany(gid, { ticket_panel_message_id: msg.id });
  await auditService.log(gid, interaction.user.tag, 'ticket.panel', { channel: channel.id });
  return interaction.reply({ embeds: [embeds.success('Panel gepostet', `Das Ticket-Panel steht in <#${channel.id}>.`, guild)], ephemeral: true });
}

async function handleOpen(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  const member = interaction.member;

  if (!settings.ticket_category_id) {
    return interaction.reply({ embeds: [embeds.error('Nicht konfiguriert', 'Die Ticket-Kategorie ist noch nicht festgelegt.', guild)], ephemeral: true });
  }

  const maxOpen = parseInt(settings.max_open_tickets || '1', 10);
  if (maxOpen > 0) {
    const { data: existing } = await withRetry(() =>
      getClient().from(TABLES.tickets).select('channel_id').eq('guild_id', gid).eq('owner_id', member.id).eq('status', 'offen').limit(1)
    );
    if (existing && existing.length) {
      const ch = guild.channels.cache.get(existing[0].channel_id);
      if (ch) {
        return interaction.reply({
          embeds: [embeds.error('Ticket bereits offen', `Du hast bereits ein offenes Ticket: <#${ch.id}>`, guild)],
          ephemeral: true,
        });
      }
    }
  }

  const channel = await guild.channels.create({
    name: channelNameFor(member.user),
    type: ChannelType.GuildText,
    parent: settings.ticket_category_id,
    permissionOverwrites: await openOverwrites(guild, member),
  });

  const { data: row, error } = await withRetry(() =>
    getClient()
      .from(TABLES.tickets)
      .insert({ guild_id: gid, channel_id: channel.id, owner_id: member.id, topic: 'Support-Ticket', status: 'offen' })
      .select('*')
      .single()
  );
  if (error) {
    logger.error(`Ticket nicht gespeichert: ${error.message}`);
    await channel.delete().catch(() => null);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Das Ticket konnte nicht erstellt werden.', guild)], ephemeral: true });
  }

  await channel.send({
    embeds: [embeds.info('🎫 Ticket erstellt', `**Nutzer:** <@${member.id}>\nBeschreibe hier dein Anliegen. Unser Team hilft dir gleich weiter.`, guild)],
    components: [helpers.row(helpers.dangerButton(`ticket_close_${row.id}`, 'Ticket schließen', '🔒'))],
  });

  await auditService.log(gid, interaction.user.tag, 'ticket.open', { id: row.id });
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

async function unclaim(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await findByChannel(interaction);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dieser Kanal ist kein Ticket.', guild)], ephemeral: true });
  }
  if (row.claimed_by && row.claimed_by !== interaction.user.id) {
    return interaction.reply({ embeds: [embeds.error('Nicht geclaimt', 'Dieses Ticket ist von dir nicht geclaimt.', guild)], ephemeral: true });
  }
  await withRetry(() => getClient().from(TABLES.tickets).update({ claimed_by: null }).eq('id', row.id));
  await interaction.channel.send({ embeds: [embeds.info('🎫 Unclaim', `Das Ticket ist wieder frei.`, guild)] });
  await auditService.log(gid, interaction.user.tag, 'ticket.unclaim', { id: row.id });
  return interaction.reply({ embeds: [embeds.success('Ticket freigegeben', 'Das Ticket wurde freigegeben.', guild)], ephemeral: true });
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

async function closeCommand(interaction) {
  const guild = interaction.guild;
  const row = await findByChannel(interaction);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dieser Kanal ist kein Ticket.', guild)], ephemeral: true });
  }
  await closeTicket(interaction, row.id, 'von Staff geschlossen');
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
        return `[${stamp}] ${m.author.tag}: ${m.content || '(Embed/Reaktion)'}`;
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
      getClient().from(TABLES.ticketTranscripts).insert({ ticket_id: row.id, content: transcriptText })
    );
  }

  await withRetry(() =>
    getClient().from(TABLES.tickets).update({ status: 'geschlossen', close_reason: reason, closed_by: interaction.user.tag }).eq('id', row.id)
  );

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

async function addUser(interaction, user) {
  const guild = interaction.guild;
  const row = await findByChannel(interaction);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dieser Kanal ist kein Ticket.', guild)], ephemeral: true });
  }
  const channel = guild.channels.cache.get(row.channel_id);
  if (!channel) {
    return interaction.reply({ embeds: [embeds.error('Kanal fehlt', 'Der Ticket-Kanal existiert nicht mehr.', guild)], ephemeral: true });
  }
  const member = guild.members.cache.get(user.id);
  if (!member) {
    return interaction.reply({ embeds: [embeds.error('Nicht im Server', 'Der Benutzer ist nicht im Server.', guild)], ephemeral: true });
  }
  await channel.permissionOverwrites.create(member, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  await channel.send({ embeds: [embeds.info('👤 Benutzer hinzugefügt', `<@${member.id}> wurde von <@${interaction.user.id}> zum Ticket hinzugefügt.`, guild)] });
  await auditService.log(guild.id, interaction.user.tag, 'ticket.add_user', { id: row.id, added: member.id });
  return interaction.reply({ embeds: [embeds.success('Benutzer hinzugefügt', `<@${member.id}> kann jetzt im Ticket schreiben.`, guild)], ephemeral: true });
}

module.exports = { postPanel, handleOpen, claim, unclaim, showCloseModal, handleCloseModal, closeCommand, addUser };
