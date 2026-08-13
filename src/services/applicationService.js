const { ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const DEFAULT_QUESTIONS = {
  Mod: ['Wie alt bist du?', 'Warum willst du Moderator werden?', 'Wie viel Zeit hast du täglich?', 'Wie gehst du mit Regelbrechern um?'],
  Supporter: ['Wie alt bist du?', 'Warum willst du Supporter werden?', 'Wie gut kennst du dich mit dem Server aus?', 'Wie verhältst du dich bei Streitigkeiten?'],
  Eventteam: ['Wie alt bist du?', 'Welche Event-Ideen hast du?', 'Wie viel Zeit hast du täglich?', 'Hast du Erfahrung mit Eventplanung?'],
};

const APPLICATION_TYPES = Object.keys(DEFAULT_QUESTIONS);

async function getQuestions(type) {
  const raw = await settingsService.get('application_questions');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed[type]) && parsed[type].length) return parsed[type].slice(0, 5);
    } catch (err) {
      logger.warn(`application_questions ist kein gültiges JSON: ${err.message}`);
    }
  }
  return (DEFAULT_QUESTIONS[type] || ['Beschreibe dich kurz.', 'Warum möchtest du dich bewerben?']).slice(0, 5);
}

async function open(interaction, type) {
  const guild = interaction.guild;
  const cooldownDays = parseInt(await settingsService.get('application_cooldown_days', '30'), 10);

  if (cooldownDays > 0) {
    const cutoff = new Date(Date.now() - cooldownDays * 86400000).toISOString();
    const { data: last } = await withRetry(() =>
      getClient()
        .from(TABLES.applications)
        .select('created_at')
        .eq('discord_id', interaction.user.id)
        .eq('type', type)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
    );
    if (last && last.length) {
      const expireAt = new Date(new Date(last[0].created_at).getTime() + cooldownDays * 86400000);
      const remaining = expireAt.getTime() - Date.now();
      return interaction.reply({
        embeds: [embeds.error('Cooldown aktiv', `Du kannst dich erst wieder als **${type}** bewerben, wenn der Cooldown vorbei ist (noch **${helpers.formatRemaining(remaining)}**).`, guild)],
        ephemeral: true,
      });
    }
  }

  const questions = await getQuestions(type);
  const modal = new ModalBuilder().setCustomId(`app_form_${type}`).setTitle(`Bewerbung: ${type}`);
  for (let i = 0; i < questions.length; i++) {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(questions[i].slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const guild = interaction.guild;
  const type = interaction.customId.replace('app_form_', '');
  const answers = {};
  for (const actionRow of interaction.components) {
    for (const field of actionRow.components) {
      answers[field.customId] = field.value;
    }
  }
  const answersText = Object.values(answers).map((a, i) => `**${i + 1}. Frage**\n${a}`).join('\n\n');

  const { data: row, error } = await withRetry(() =>
    getClient()
      .from(TABLES.applications)
      .insert({ discord_id: interaction.user.id, type, answers, status: 'offen' })
      .select('*')
      .single()
  );
  if (error || !row) {
    logger.error(`Bewerbung nicht gespeichert: ${error ? error.message : 'keine Daten'}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Deine Bewerbung konnte nicht gespeichert werden.', guild)], ephemeral: true });
  }

  const categoryId = await settingsService.get('application_category_id');
  if (!categoryId) {
    return interaction.reply({
      embeds: [embeds.error('Nicht konfiguriert', 'Die Bewerbungs-Kategorie ist noch nicht eingerichtet.', guild)],
      ephemeral: true,
    });
  }

  const staffRole = await settingsService.get('staff_role');
  const adminRole = await settingsService.get('admin_role');
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
      name: `bewerbung-${type.toLowerCase()}-${row.id}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    logger.error(`Bewerbungs-Kanal nicht erstellt: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Der Bewerbungs-Kanal konnte nicht erstellt werden.', guild)], ephemeral: true });
  }

  await withRetry(() => getClient().from(TABLES.applications).update({ channel_id: channel.id }).eq('id', row.id));

  const embed = embeds.info(
    `📝 Bewerbung: ${type}`,
    `**Bewerber:** <@${interaction.user.id}>\n\n${answersText}`,
    guild
  );
  const buttons = helpers.row(
    helpers.successButton(`app_accept_${row.id}`, 'Annehmen', '👍'),
    helpers.dangerButton(`app_reject_${row.id}`, 'Ablehnen', '👎')
  );
  const msg = await channel.send({ embeds: [embed], components: [buttons] });
  await withRetry(() => getClient().from(TABLES.applications).update({ message_id: msg.id }).eq('id', row.id));

  if ((await settingsService.get('application_staff_ping', 'true')) === 'true' && staffRole) {
    try {
      await channel.send(`${helpers.findRole(guild, staffRole)}`);
    } catch (err) { /* ignorieren */ }
  }

  return interaction.reply({ embeds: [embeds.success('Bewerbung eingereicht', `Deine Bewerbung als **${type}** wurde eingereicht. Kanal: <#${channel.id}>`, guild)], ephemeral: true });
}

async function handleDecisionButton(interaction) {
  const guild = interaction.guild;
  const settings = await settingsService.getAll();
  if (!helpers.isGuildModerator(interaction.member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Bewerbungen annehmen oder ablehnen.', guild)], ephemeral: true });
  }

  const parts = interaction.customId.split('_');
  const verdict = parts[1];
  const id = Number(parts[2]);
  const { data: row } = await withRetry(() =>
    getClient().from(TABLES.applications).select('*').eq('id', id).maybeSingle()
  );
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Die Bewerbung existiert nicht mehr.', guild)], ephemeral: true });
  }
  if (row.status !== 'offen') {
    return interaction.reply({ embeds: [embeds.error('Bereits entschieden', 'Diese Bewerbung wurde bereits entschieden.', guild)], ephemeral: true });
  }

  const accepted = verdict === 'accept';
  const newStatus = accepted ? 'angenommen' : 'abgelehnt';
  await withRetry(() => getClient().from(TABLES.applications).update({ status: newStatus }).eq('id', id));

  const channel = guild.channels.cache.get(row.channel_id);
  if (channel && row.message_id) {
    try {
      const msg = await channel.messages.fetch(row.message_id);
      const oldEmbed = msg.embeds[0];
      const updated = accepted
        ? embeds.success(`📝 Bewerbung: ${row.type}`, `${oldEmbed ? oldEmbed.description : ''}\n\n**Status: Angenommen**`, guild)
        : embeds.error(`📝 Bewerbung: ${row.type}`, `${oldEmbed ? oldEmbed.description : ''}\n\n**Status: Abgelehnt**`, guild);
      await msg.edit({ embeds: [updated], components: [] });
    } catch (err) { logger.warn(`Bewerbungs-Embed nicht aktualisiert: ${err.message}`); }
  }

  try {
    const user = await interaction.client.users.fetch(row.discord_id);
    if (accepted) {
      await user.send(`🎉 Glückwunsch! Deine Bewerbung als **${row.type}** wurde angenommen.`);
    } else {
      await user.send(`Deine Bewerbung als **${row.type}** wurde leider abgelehnt.`);
    }
  } catch (err) { logger.warn(`DM an Bewerber fehlgeschlagen: ${err.message}`); }

  await auditService.log(interaction.user.tag, `application.${newStatus}`, { id: row.id, type: row.type });
  return interaction.reply({ embeds: [embeds.success(accepted ? 'Angenommen' : 'Abgelehnt', `Bewerbung von <@${row.discord_id}> wurde ${accepted ? 'angenommen' : 'abgelehnt'}.`, guild)], ephemeral: true });
}

async function close(interaction, channelId) {
  const guild = interaction.guild;
  const { data: row } = await withRetry(() =>
    getClient().from(TABLES.applications).select('*').eq('channel_id', channelId).maybeSingle()
  );
  if (row && row.status === 'offen') {
    await withRetry(() => getClient().from(TABLES.applications).update({ status: 'abgelehnt' }).eq('id', row.id));
    await auditService.log(interaction.user.tag, 'application.close', { id: row.id, type: row.type });
  }
  const channel = guild.channels.cache.get(channelId);
  if (channel) {
    await channel.permissionOverwrites.set([{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]);
  }
  return interaction.reply({ embeds: [embeds.success('Bewerbung geschlossen', 'Der Kanal wurde archiviert.', guild)], ephemeral: true });
}

async function list(interaction) {
  const guild = interaction.guild;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.applications).select('*').eq('status', 'offen').order('created_at', { ascending: false }).limit(20)
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.info('📝 Offene Bewerbungen', 'Aktuell keine offenen Bewerbungen.', guild)], ephemeral: true });
  }
  const lines = data.map(
    (a) => `**ID ${a.id}** — ${a.type} · <@${a.discord_id}> · ${helpers.formatDateTime(a.created_at)}`
  );
  return interaction.reply({ embeds: [embeds.info('📝 Offene Bewerbungen', lines.join('\n'), guild)], ephemeral: true });
}

module.exports = { APPLICATION_TYPES, open, handleModalSubmit, handleDecisionButton, close, list };
