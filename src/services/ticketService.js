const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { config } = require('../config');
const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

async function postPanel(interaction) {
  const guild = interaction.guild;
  const panelChannelId = await settingsService.get('ticket_panel_channel_id');
  if (!panelChannelId) {
    return interaction.reply({
      embeds: [embeds.error('Kein Panel-Kanal', 'Setze unter Einstellungen die `ticket_panel_channel_id`.', guild)],
      ephemeral: true,
    });
  }
  const channel = guild.channels.cache.get(panelChannelId);
  if (!channel) {
    return interaction.reply({ embeds: [embeds.error('Kanal nicht gefunden', 'Der Panel-Kanal existiert nicht mehr.', guild)], ephemeral: true });
  }

  const panel = embeds.info('Support-Ticket', 'Klicke auf 🎫 um ein Ticket zu öffnen', guild);
  const row = helpers.row(helpers.primaryButton('ticket_panel', 'Ticket öffnen', '🎫'));

  let message = null;
  const existingId = await settingsService.get('ticket_panel_message_id');
  if (existingId) {
    try {
      const old = await channel.messages.fetch(existingId);
      message = await old.edit({ embeds: [panel], components: [row] });
    } catch (err) { message = null; }
  }
  if (!message) message = await channel.send({ embeds: [panel], components: [row] });

  await settingsService.setMany({ ticket_panel_message_id: message.id });
  await auditService.log(interaction.user.tag, 'ticket.panel', { channel: channel.id });
  return interaction.reply({ embeds: [embeds.success('Panel gepostet', `Das Ticket-Panel steht in <#${channel.id}>.`, guild)], ephemeral: true });
}

async function countOpen(userId) {
  const { count } = await withRetry(() =>
    getClient().from(TABLES.tickets).select('id', { count: 'exact' }).eq('owner_id', userId).eq('status', 'offen')
  );
  return count || 0;
}

async function handleOpen(interaction) {
  const guild = interaction.guild;
  const settings = await settingsService.getAll();
  const maxOpen = parseInt(settings.max_open_tickets || '1', 10);

  const open = await countOpen(interaction.user.id);
  if (open >= maxOpen) {
    return interaction.reply({
      embeds: [embeds.error('Zu viele Tickets', `Du hast bereits **${open}** offene Tickets. Bitte schließe zuerst ein Ticket.`, guild)],
      ephemeral: true,
    });
  }

  const categoryId = settings.ticket_category_id;
  if (!categoryId) {
    return interaction.reply({
      embeds: [embeds.error('Nicht konfiguriert', 'Die Ticket-Kategorie ist noch nicht eingerichtet.', guild)],
      ephemeral: true,
    });
  }

  const staffRole = settings.staff_role;
  const adminRole = settings.admin_role;
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (staffRole) {
    const role = helpers.findRole(guild, staffRole);
    if (role) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  if (adminRole && adminRole !== staffRole) {
    const role = helpers.findRole(guild, adminRole);
    if (role) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    logger.error(`Ticket-Kanal nicht erstellt: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Der Ticket-Kanal konnte nicht erstellt werden.', guild)], ephemeral: true });
  }

  const { data: row } = await withRetry(() =>
    getClient().from(TABLES.tickets).insert({ channel_id: channel.id, owner_id: interaction.user.id, status: 'offen' }).select('*').single()
  );

  const welcome = embeds.info('🎫 Support-Ticket', `Hallo <@${interaction.user.id}>,\nschreibe hier dein Anliegen. Der Staff wird sich kümmern.`, guild);
  const closeRow = helpers.row(helpers.dangerButton('ticket_close', 'Ticket schließen', '🔒'));
  await channel.send({ embeds: [welcome], components: [closeRow] });

  return interaction.reply({ embeds: [embeds.success('Ticket geöffnet', `Dein Ticket: <#${channel.id}>`, guild)], ephemeral: true });
}

async function getTicketByChannel(channelId) {
  const { data } = await withRetry(() =>
    getClient().from(TABLES.tickets).select('*').eq('channel_id', channelId).eq('status', 'offen').maybeSingle()
  );
  return data;
}

async function updateTicketEmbed(channel, claimedBy) {
  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  if (!msgs) return;
  const target = msgs.find((m) => m.author.id === channel.client.user.id && m.embeds[0] && m.embeds[0].title === '🎫 Support-Ticket');
  if (!target) return;
  const embed = embeds.info(
    '🎫 Support-Ticket',
    `Hallo <@${channel.topic ? channel.topic : ''}>,\nschreibe hier dein Anliegen. Der Staff wird sich kümmern.\n\n` +
    (claimedBy ? `🧑‍✈️ **Zuständig:** <@${claimedBy}>` : ''),
    channel.guild
  );
  await target.edit({ embeds: [embed] });
}

async function claim(interaction) {
  const guild = interaction.guild;
  const settings = await settingsService.getAll();
  if (!helpers.isGuildModerator(interaction.member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Tickets claimen.', guild)], ephemeral: true });
  }
  const row = await getTicketByChannel(interaction.channelId);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dies ist kein offenes Ticket.', guild)], ephemeral: true });
  }
  if (row.claimed_by && row.claimed_by !== interaction.user.id) {
    return interaction.reply({ embeds: [embeds.error('Bereits geclaimt', `Das Ticket ist bereits von <@${row.claimed_by}> geclaimt.`, guild)], ephemeral: true });
  }
  await withRetry(() => getClient().from(TABLES.tickets).update({ claimed_by: interaction.user.id }).eq('id', row.id));
  await updateTicketEmbed(interaction.channel, interaction.user.id);
  await auditService.log(interaction.user.tag, 'ticket.claim', { id: row.id });
  try {
    const owner = await interaction.client.users.fetch(row.owner_id);
    await owner.send(`Dein Ticket wird von <@${interaction.user.id}> bearbeitet.`);
  } catch (err) { /* ignorieren */ }
  return interaction.reply({ embeds: [embeds.success('Ticket geclaimt', `Du übernimmst jetzt <#${interaction.channelId}>.`, guild)], ephemeral: true });
}

async function unclaim(interaction) {
  const guild = interaction.guild;
  const row = await getTicketByChannel(interaction.channelId);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dies ist kein offenes Ticket.', guild)], ephemeral: true });
  }
  if (row.claimed_by !== interaction.user.id) {
    return interaction.reply({ embeds: [embeds.error('Nicht dein Ticket', 'Du hast dieses Ticket nicht geclaimt.', guild)], ephemeral: true });
  }
  await withRetry(() => getClient().from(TABLES.tickets).update({ claimed_by: null }).eq('id', row.id));
  await updateTicketEmbed(interaction.channel, null);
  await auditService.log(interaction.user.tag, 'ticket.unclaim', { id: row.id });
  return interaction.reply({ embeds: [embeds.success('Ticket freigegeben', 'Das Ticket ist jetzt wieder frei.', guild)], ephemeral: true });
}

async function showCloseModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_close_modal')
    .setTitle('Ticket schließen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    );
  await interaction.showModal(modal);
}

async function handleCloseModal(interaction) {
  const reason = interaction.fields.getTextInputValue('reason') || '';
  await closeTicket(interaction, reason, 'user');
}

async function closeTicket(interaction, reason, by) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  const row = await getTicketByChannel(channel.id);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dies ist kein offenes Ticket.', guild)], ephemeral: true });
  }

  const defaultReason = by === 'staff' ? 'Von Staff geschlossen' : reason || 'Kein Grund angegeben';
  const finalReason = by === 'staff' ? (reason || defaultReason) : (reason || defaultReason);

  const transcript = await generateTranscript(channel);
  const transcriptsEnabled = (await settingsService.get('ticket_transcripts_enabled', 'true')) === 'true';

  if (transcriptsEnabled) {
    await withRetry(() =>
      getClient().from(TABLES.ticketTranscripts).insert({ ticket_id: row.id, content: transcript })
    );
  }

  await withRetry(() =>
    getClient().from(TABLES.tickets).update({
      status: 'geschlossen',
      close_reason: finalReason,
      closed_by: interaction.user.id,
    }).eq('id', row.id)
  );

  const logChannelId = await settingsService.get('ticket_log_channel_id');
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId);
    if (logChannel) {
      try {
        await logChannel.send({
          embeds: [embeds.warning('🔒 Ticket geschlossen', `**Ticket:** <#${channel.id}>\n**Owner:** <@${row.owner_id}>\n**Grund:** ${finalReason}\n**Transkript:** \`${transcriptFile(transcript)}\``, guild)],
        });
      } catch (err) { logger.warn(`Ticket-Log fehlgeschlagen: ${err.message}`); }
    }
  }

  await auditService.log(interaction.user.tag, 'ticket.close', { id: row.id, reason: finalReason });

  if (!interaction.replied) {
    await interaction.reply({ embeds: [embeds.success('Ticket geschlossen', 'Der Kanal wird gleich gelöscht.', guild)], ephemeral: true });
  }
  setTimeout(() => {
    channel.delete().catch((err) => logger.warn(`Ticket-Kanal nicht gelöscht: ${err.message}`));
  }, 10000);
}

function transcriptFile(content) {
  const dir = path.join(config.transcriptDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `ticket-${Date.now()}.txt`;
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return name;
}

async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const lines = [];
  for (const msg of messages.reverse().values()) {
    const time = msg.createdAt.toLocaleString('de-DE');
    lines.push(`[${time}] ${msg.author.username}: ${msg.content || (msg.embeds[0] ? msg.embeds[0].title : '')}`);
  }
  return lines.join('\n');
}

async function closeCommand(interaction) {
  const row = await getTicketByChannel(interaction.channelId);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dies ist kein offenes Ticket.', guild)], ephemeral: true });
  }
  await closeTicket(interaction, 'Von Staff geschlossen', 'staff');
}

async function addUser(interaction, target) {
  const row = await getTicketByChannel(interaction.channelId);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Kein Ticket', 'Dies ist kein offenes Ticket.', interaction.guild)], ephemeral: true });
  }
  try {
    await interaction.channel.permissionOverwrites.create(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  } catch (err) {
    return interaction.reply({ embeds: [embeds.error('Fehler', `Konnte ${target} nicht hinzufügen.`, interaction.guild)], ephemeral: true });
  }
  return interaction.reply({ embeds: [embeds.success('Benutzer hinzugefügt', `<@${target.id}> kann das Ticket jetzt sehen.`, interaction.guild)], ephemeral: true });
}

module.exports = { postPanel, handleOpen, claim, unclaim, showCloseModal, handleCloseModal, closeTicket, closeCommand, addUser, generateTranscript };
