const { ActionRowBuilder, ButtonBuilder, MessageFlags } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');
const { config } = require('../config');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');
const { DEFAULT_INTERVIEW_QUESTIONS, SCORE_VALUES } = require('./interviewData');

const QUESTIONS_PER_MESSAGE = 5;
const SCORE_LABELS = { 0: '0', 0.5: '0,5', 1: '1', 1.5: '1,5', 2: '2' };

const interviewMessages = new Map();

function scoreToInt(value) {
  return Math.round(value * 10);
}

function intToScore(value) {
  return value / 10;
}

function questionMaxPoints(question) {
  const value = Number(question && question.max_points);
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

function getMaxPoints(questions) {
  return questions.reduce((sum, q) => sum + questionMaxPoints(q), 0);
}

async function ensureQuestions(guildId) {
  const { data } = await withRetry(() => getClient().from(TABLES.interviewQuestions).select('id').eq('guild_id', guildId).limit(1));
  if (data && data.length) return;
  const rows = DEFAULT_INTERVIEW_QUESTIONS.map((q, i) => ({ guild_id: guildId, section: q.section, frage: q.frage, sort: i + 1, max_points: 2 }));
  await withRetry(() => getClient().from(TABLES.interviewQuestions).insert(rows));
}

async function getQuestions(guildId) {
  await ensureQuestions(guildId);
  const { data } = await withRetry(() => getClient().from(TABLES.interviewQuestions).select('*').eq('guild_id', guildId).order('section', { ascending: true }).order('sort', { ascending: true }));
  return data || [];
}

function chunkQuestions(questions) {
  const chunks = [];
  for (let i = 0; i < questions.length; i += QUESTIONS_PER_MESSAGE) chunks.push(questions.slice(i, i + QUESTIONS_PER_MESSAGE));
  return chunks;
}

function scoreStyle(value) {
  if (value === 0) return 4;
  if (value === 0.5) return 2;
  if (value === 1) return 1;
  return 3;
}

function buildScoreButtons(interviewId, q, scores) {
  const current = scores && scores[q.id];
  return new ActionRowBuilder().addComponents(SCORE_VALUES.map((v) => {
    const chosen = current !== undefined && current === v;
    const max = questionMaxPoints(q);
    if (v > max) return null;
    return new ButtonBuilder().setCustomId(`interview_${interviewId}_${q.id}_${scoreToInt(v)}`).setLabel(chosen ? `✅ ${SCORE_LABELS[v]}` : SCORE_LABELS[v]).setStyle(scoreStyle(v));
  }).filter(Boolean));
}

function buildSectionEmbed(interview, chunk, startIndex, questions) {
  const scoredCount = Object.keys(interview.scores || {}).length;
  const total = questions.length;
  const maxPoints = getMaxPoints(questions);
  const fields = chunk.map((q, i) => ({ name: `Frage ${startIndex + i + 1} — Abschnitt ${q.section}`, value: `${q.frage}\n**Punktzahl: ${interview.scores[q.id] !== undefined ? SCORE_LABELS[interview.scores[q.id]] : '—'} / ${questionMaxPoints(q)}**` }));
  const done = scoredCount >= total;
  return {
    color: 0xe8453c,
    title: `🎤 Interview: ${interview.applicant_name || interview.applicant_id}`,
    description: `${done ? '✅ **Fertig**' : `**Bewertet: ${scoredCount}/${total} Fragen**`}${done ? ` — Ergebnis: **${interview.total} / ${maxPoints} Punkte**` : ''}`,
    fields,
    footer: { text: 'Bewertung ändern: einfach neuen Button klicken' },
  };
}

function buildSectionMessage(interview, chunk, startIndex, questions) {
  return { embeds: [buildSectionEmbed(interview, chunk, startIndex, questions)], components: chunk.map((q) => buildScoreButtons(interview.id, q, interview.scores)) };
}

async function getInterview(id, guildId) {
  const { data } = await withRetry(() => getClient().from(TABLES.interviews).select('*').eq('id', id).eq('guild_id', guildId).maybeSingle());
  return data || null;
}

async function startInterview(interaction, target, channel) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);
  if (!helpersCanManage(interaction, settings)) return interaction.reply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Interviews starten.', guild)], flags: MessageFlags.Ephemeral });

  const questions = await getQuestions(gid);
  if (!questions.length) return interaction.reply({ embeds: [embeds.error('Keine Fragen', 'Für diesen Server sind keine Interview-Fragen hinterlegt.', guild)], flags: MessageFlags.Ephemeral });

  const channelId = channel ? channel.id : settings.interview_channel_id || interaction.channel.id;
  const targetChannel = guild.channels.cache.get(channelId) || interaction.channel;
  if (!targetChannel || !targetChannel.isTextBased()) return interaction.reply({ embeds: [embeds.error('Kein Kanal', 'Der angegebene Kanal ist kein Textkanal.', guild)], flags: MessageFlags.Ephemeral });

  const { data: row } = await withRetry(() => getClient().from(TABLES.interviews).insert({ guild_id: gid, applicant_id: target.id, applicant_name: target.tag, status: 'offen', scores: {}, channel_id: targetChannel.id }).select().single());
  if (!row) return interaction.reply({ embeds: [embeds.error('Fehler', 'Das Interview konnte nicht angelegt werden.', guild)], flags: MessageFlags.Ephemeral });

  const chunks = chunkQuestions(questions);
  const interview = { ...row, scores: {} };
  const messageIds = [];
  let start = 0;
  for (const chunk of chunks) {
    const msg = await targetChannel.send(buildSectionMessage(interview, chunk, start, questions));
    messageIds.push(msg.id);
    start += chunk.length;
  }
  interviewMessages.set(String(row.id), { channelId: targetChannel.id, messageIds, chunks, resultPosted: false });

  await auditService.log(gid, interaction.user.tag, 'interview.start', { applicant: target.tag, channel: targetChannel.id, fragen: questions.length });
  return interaction.reply({ embeds: [embeds.success('Interview gestartet', `Das Interview von **${target.tag}** wurde in <#${targetChannel.id}> gestartet (${questions.length} Fragen).`, guild)], flags: MessageFlags.Ephemeral });
}

function helpersCanManage(interaction, settings) {
  if (interaction.member && interaction.member.id === config.ownerUserId) return true;
  if (interaction.member && interaction.member.id === interaction.member.guild.ownerId) return true;
  return helpers.isGuildModerator(interaction.member, settings);
}

async function handleScore(interaction) {
  const m = /^interview_(\d+)_(\d+)_(\d+)$/.exec(interaction.customId);
  if (!m) return;

  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

  const interviewId = Number(m[1]);
  const questionId = Number(m[2]);
  const score = intToScore(Number(m[3]));
  if (SCORE_VALUES.indexOf(score) === -1) return;

  const gid = interaction.guild.id;
  const settings = await settingsService.getAll(gid);
  if (!helpersCanManage(interaction, settings)) return interaction.editReply({ embeds: [embeds.error('Keine Berechtigung', 'Nur Staff kann Interviews bewerten.', interaction.guild)], components: [] });

  const row = await getInterview(interviewId, gid);
  if (!row) return interaction.editReply({ embeds: [embeds.error('Nicht gefunden', 'Das Interview existiert nicht mehr.', interaction.guild)], components: [] });

  const scores = Object.assign({}, row.scores || {});
  scores[questionId] = score;

  const questions = await getQuestions(gid);
  const totalQuestions = questions.length;
  const maxTotal = getMaxPoints(questions);
  const scoredCount = Object.keys(scores).length;
  const sum = Object.values(scores).reduce((a, b) => a + Number(b || 0), 0);
  const threshold = Number(settings.interview_pass_threshold || 45);
  const passed = sum >= threshold;
  const status = scoredCount >= totalQuestions ? 'fertig' : 'offen';

  await withRetry(() => getClient().from(TABLES.interviews).update({ scores, total: sum, passed, status }).eq('id', interviewId).eq('guild_id', gid));

  const interview = { ...row, scores, total: sum, passed, status };
  const chunks = chunkQuestions(questions);
  const entry = interviewMessages.get(String(interviewId));
  const clickedIndex = entry ? entry.messageIds.indexOf(interaction.message.id) : -1;

  const updateMessage = async (chunkIndex, messageId) => {
    let start = 0;
    for (let i = 0; i < chunkIndex; i++) start += chunks[i].length;
    const payload = buildSectionMessage(interview, chunks[chunkIndex], start, questions);
    if (messageId === interaction.message.id) {
      await interaction.editReply(payload);
    } else {
      try {
        const channel = await interaction.client.channels.fetch(entry.channelId);
        const msg = await channel.messages.fetch(messageId);
        await msg.edit(payload);
      } catch (err) {
        logger.warn(`Interview-Nachricht nicht aktualisiert: ${err.message}`);
      }
    }
  };

  if (entry && entry.messageIds.length) {
    for (let i = 0; i < entry.messageIds.length; i++) await updateMessage(i, entry.messageIds[i]);
  } else if (clickedIndex === -1) {
    return interaction.editReply({ content: '⏳ Das Interview wurde durch einen Neustart unterbrochen. Bitte neu starten.', components: [] });
  }

  if (status === 'fertig' && entry && !entry.resultPosted) {
    entry.resultPosted = true;
    try {
      const channel = await interaction.client.channels.fetch(entry.channelId);
      const result = {
        color: passed ? 0x2ecc71 : 0xe74c3c,
        title: passed ? '🎉 Interview bestanden' : '❌ Interview nicht bestanden',
        description: `**${interview.applicant_name || interview.applicant_id}** hat **${sum.toLocaleString('de-DE')}** von **${maxTotal.toLocaleString('de-DE')}** Punkten erreicht.\nBestanden ab **${threshold}** Punkten.`,
        footer: { text: 'Emergency Hamburg Roleplay • Bewertung abgeschlossen' },
      };
      await channel.send({ embeds: [result] });
      await auditService.log(gid, interaction.user.tag, 'interview.complete', { applicant: interview.applicant_name || interview.applicant_id, total: sum, maxTotal, passed });
    } catch (err) {
      logger.warn(`Interview-Ergebnis nicht gesendet: ${err.message}`);
    }
  }
}

async function getResults(guildId) {
  const { data } = await withRetry(() => getClient().from(TABLES.interviews).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(100));
  return data || [];
}

async function getResultDetail(interviewId, guildId) {
  const row = await getInterview(interviewId, guildId);
  if (!row) return null;
  const questions = await getQuestions(guildId);
  return { row, questions };
}

module.exports = { startInterview, handleScore, getQuestions, ensureQuestions, getResults, getResultDetail, getMaxPoints };
