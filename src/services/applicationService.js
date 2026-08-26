const { ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const interviewService = require('./interviewService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const DEFAULT_QUESTIONS = {
  Mod: ['Wie alt bist du?', 'Warum willst du Moderator werden?', 'Wie viel Zeit hast du täglich?', 'Wie gehst du mit Regelbrechern um?'],
  Supporter: ['Wie alt bist du?', 'Warum willst du Supporter werden?', 'Wie gut kennst du dich mit dem Server aus?', 'Wie verhältst du dich bei Streitigkeiten?'],
  Eventteam: ['Wie alt bist du?', 'Welche Event-Ideen hast du?', 'Wie viel Zeit hast du täglich?', 'Hast du Erfahrung mit Eventplanung?'],
};

const sessions = new Map();

async function getQuestions(guildId, type) {
  const raw = await settingsService.get(guildId, 'application_questions');
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

function buildReviewEmbed(guild, type, user, questions, answers, status) {
  const color = status === 'angenommen' ? embeds.COLORS.success : status === 'abgelehnt' ? embeds.COLORS.error : embeds.COLORS.info;
  return embeds.v2({
    color,
    title: `📝 Bewerbung: ${type}`,
    description: `**Bewerber:** <@${user.id}>\n**Status:** ${status === 'offen' ? '⏳ Offen' : status === 'angenommen' ? '✅ Angenommen' : '❌ Abgelehnt'}`,
    fields: questions.map((q, i) => ({ name: `${i + 1}. ${q.slice(0, 200)}`, value: (answers[i] || '—').slice(0, 1024) })),
    guild,
  });
}

async function handleDmMessage(message) {
  if (message.channel.type !== ChannelType.DM) return false;
  const session = sessions.get(message.author.id);
  if (!session) return false;
  const guild = message.client.guilds.cache.get(session.guildId);
  if (!guild) { sessions.delete(message.author.id); return false; }

  const content = (message.content || '').trim();
  if (/^abbrechen$/i.test(content)) {
    sessions.delete(message.author.id);
    await message.author.send({ embeds: [embeds.warning('Bewerbung abgebrochen', 'Deine Bewerbung wurde abgebrochen.', guild)] });
    return true;
  }

  session.answers.push(content.slice(0, 1000));
  session.step += 1;

  if (session.step < session.questions.length) {
    await message.author.send({ embeds: [embeds.info(`📝 Bewerbung: ${session.type}`, `**Frage ${session.step + 1}/${session.questions.length}:**\n${session.questions[session.step]}`, guild)] });
    return true;
  }

  sessions.delete(message.author.id);
  await finalize(session, message.author, guild);
  return true;
}

async function finalize(session, user, guild) {
  const gid = session.guildId;

  const { data: row, error } = await withRetry(() =>
    getClient()
      .from(TABLES.applications)
      .insert({ guild_id: gid, discord_id: user.id, type: session.type, answers: session.answers, questions: session.questions, status: 'offen' })
      .select('*')
      .single()
  );
  if (error || !row) {
    logger.error(`Bewerbung nicht gespeichert: ${error ? error.message : 'keine Daten'}`);
    return user.send({ embeds: [embeds.error('Fehler', 'Deine Bewerbung konnte nicht gespeichert werden.', guild)] });
  }

  const categoryId = await settingsService.get(gid, 'application_category_id');
  if (!categoryId) {
    return user.send({ embeds: [embeds.error('Nicht konfiguriert', 'Die Bewerbungs-Kategorie ist noch nicht eingerichtet.', guild)] });
  }

  const staffRoleNames = await settingsService.get(gid, 'staff_roles');
  const adminRoleNames = await settingsService.get(gid, 'admin_roles');
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  const viewAllow = { allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] };
  const staffRoles = helpers.resolveRoles(guild, staffRoleNames);
  for (const role of staffRoles) overwrites.push({ id: role.id, ...viewAllow });
  const adminRoles = helpers.resolveRoles(guild, adminRoleNames);
  for (const role of adminRoles) {
    if (!overwrites.some((o) => o.id === role.id)) overwrites.push({ id: role.id, ...viewAllow });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `bewerbung-${session.type.toLowerCase()}-${row.id}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    logger.error(`Bewerbungs-Kanal nicht erstellt: ${err.message}`);
    return user.send({ embeds: [embeds.error('Fehler', 'Der Bewerbungs-Kanal konnte nicht erstellt werden.', guild)] });
  }

  await withRetry(() => getClient().from(TABLES.applications).update({ channel_id: channel.id }).eq('id', row.id));

  const embed = buildReviewEmbed(guild, session.type, user, session.questions, session.answers, 'offen');
  const buttons = helpers.row(
    helpers.successButton(`app_accept_${row.id}`, 'Annehmen', '👍'),
    helpers.dangerButton(`app_reject_${row.id}`, 'Ablehnen', '👎'),
    helpers.primaryButton(`app_interview_${row.id}`, 'Interview starten', '🎤')
  );
  const msg = await channel.send({ embeds: [embed], components: [buttons] });
  await withRetry(() => getClient().from(TABLES.applications).update({ message_id: msg.id }).eq('id', row.id));

  if ((await settingsService.get(gid, 'application_staff_ping', 'true')) === 'true' && staffRoles.length) {
    try {
      await channel.send(staffRoles.map((r) => `<@&${r.id}>`).join(' '));
    } catch (err) { /* ignorieren */ }
  }

  return user.send({ embeds: [embeds.success('Bewerbung eingereicht', `Deine Bewerbung als **${session.type}** wurde eingereicht. Kanal: <#${channel.id}>`, guild)] });
}

async function handleDecisionButton(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
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
  if (row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Die Bewerbung existiert nicht mehr.', guild)], ephemeral: true });
  }
  if (row.status !== 'offen') {
    return interaction.reply({ embeds: [embeds.error('Bereits entschieden', 'Diese Bewerbung wurde bereits entschieden.', guild)], ephemeral: true });
  }

  const accepted = verdict === 'accept';
  const newStatus = accepted ? 'angenommen' : 'abgelehnt';

  if (accepted) {
    const roleId = await settingsService.get(gid, 'application_role_id');
    if (roleId) {
      const member = await guild.members.fetch(row.discord_id).catch(() => null);
      if (member && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch((err) => logger.warn(`Bewerbungs-Rolle nicht vergeben: ${err.message}`));
      }
    }
  }

  await withRetry(() => getClient().from(TABLES.applications).update({ status: newStatus }).eq('id', id));

  const questions = row.questions && Array.isArray(row.questions) ? row.questions : await getQuestions(gid, row.type);
  const answers = Array.isArray(row.answers) ? row.answers : Object.values(row.answers || {}).map((v) => String(v));
  const user = { id: row.discord_id };

  const channel = guild.channels.cache.get(row.channel_id);
  if (channel && row.message_id) {
    try {
      const msg = await channel.messages.fetch(row.message_id);
      const embed = buildReviewEmbed(guild, row.type, user, questions, answers, newStatus);
      const components = accepted ? [helpers.row(helpers.primaryButton(`app_interview_${row.id}`, 'Interview starten', '🎤'))] : [];
      await msg.edit({ embeds: [embed], components });
    } catch (err) { logger.warn(`Bewerbungs-Embed nicht aktualisiert: ${err.message}`); }
  }

  try {
    const member = await guild.members.fetch(row.discord_id);
    if (accepted) {
      await member.send(`🎉 Glückwunsch! Deine Bewerbung als **${row.type}** wurde angenommen.`);
    } else {
      await member.send(`Deine Bewerbung als **${row.type}** wurde leider abgelehnt.`);
    }
  } catch (err) { logger.warn(`DM an Bewerber fehlgeschlagen: ${err.message}`); }

  await auditService.log(gid, interaction.user.tag, `application.${newStatus}`, { id: row.id, type: row.type });
  return interaction.reply({ embeds: [embeds.success(accepted ? 'Angenommen' : 'Abgelehnt', `Bewerbung von <@${row.discord_id}> wurde ${accepted ? 'angenommen' : 'abgelehnt'}.`, guild)], ephemeral: true });
}

async function handleInterviewButton(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  if (!helpers.isGuildModerator(interaction.member, settings)) {
    return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann ein Interview starten.', guild)], ephemeral: true });
  }

  const id = Number(interaction.customId.split('_')[2]);
  const { data: row } = await withRetry(() =>
    getClient().from(TABLES.applications).select('*').eq('id', id).maybeSingle()
  );
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Die Bewerbung existiert nicht mehr.', guild)], ephemeral: true });
  }
  if (row.status !== 'angenommen') {
    return interaction.reply({ embeds: [embeds.error('Noch nicht angenommen', 'Ein Interview kann nur für angenommene Bewerbungen gestartet werden.', guild)], ephemeral: true });
  }

  const member = await guild.members.fetch(row.discord_id).catch(() => null);
  if (!member) {
    return interaction.reply({ embeds: [embeds.error('Nicht im Server', 'Der Bewerber ist nicht mehr auf diesem Server.', guild)], ephemeral: true });
  }

  return interviewService.startInterview(interaction, member.user, null, row.id);
}

module.exports = { handleDmMessage, handleDecisionButton, handleInterviewButton };
