const { getClient, TABLES, withRetry } = require('../supabase');
const { client } = require('../discord/client');
const logger = require('../logger');
const auditService = require('../services/auditService');
const { parseGradingSheet } = require('../services/interviewImport');
const interviewService = require('../services/interviewService');

async function importGradingSheet(req, res, guildId, body) {
  const interviewId = Number(body.interview_id);
  const text = String(body.grading_sheet || '');
  if (!interviewId || !text.trim()) return 'Bewertungsbogen oder Interview fehlt.';

  const parsed = parseGradingSheet(text);
  if (!parsed.length) return 'Keine bewertbaren Fragen gefunden. Erwartet wird z. B. `1. Frage \'1,5/2P\'`.'.replace(/\\'/g, "'");

  const { data: interview } = await withRetry(() =>
    getClient().from(TABLES.interviews).select('*').eq('id', interviewId).eq('guild_id', guildId).maybeSingle()
  );
  if (!interview) return 'Interview nicht gefunden.';

  const { data: questions } = await withRetry(() =>
    getClient().from(TABLES.interviewQuestions).select('*').eq('guild_id', guildId).order('section', { ascending: true }).order('sort', { ascending: true })
  );
  if (!questions || !questions.length) return 'Für diesen Server sind keine Interview-Fragen eingerichtet.';

  const byNumber = new Map(questions.map((q, index) => [index + 1, q]));
  const scores = { ...(interview.scores || {}) };
  let imported = 0;
  for (const item of parsed) {
    const q = byNumber.get(item.number);
    if (!q) continue;
    const max = Number(q.max_points ?? item.maxPoints ?? 2);
    if (item.score < 0 || item.score > max) continue;
    scores[q.id] = item.score;
    imported++;
  }

  if (!imported) return 'Die Fragen aus dem Bewertungsbogen konnten keiner Interview-Frage zugeordnet werden.';

  const total = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
  const maxTotal = questions.reduce((sum, q) => sum + Number(q.max_points ?? 2), 0);
  const scoredCount = Object.keys(scores).filter((id) => questions.some((q) => String(q.id) === String(id))).length;
  const settings = await interviewService.getResults(guildId).catch(() => []);
  void settings;

  const { data: thresholdRow } = await withRetry(() =>
    getClient().from(TABLES.settings).select('value').eq('guild_id', guildId).eq('key', 'interview_pass_threshold').maybeSingle()
  );
  const threshold = Number(thresholdRow?.value || 45);
  const complete = scoredCount >= questions.length;
  const passed = complete ? total >= threshold : null;
  const status = complete ? 'fertig' : 'offen';

  await withRetry(() =>
    getClient().from(TABLES.interviews).update({ scores, total, passed, status }).eq('id', interviewId).eq('guild_id', guildId)
  );

  if (complete && client && client.isReady() && interview.channel_id) {
    try {
      const channel = await client.channels.fetch(interview.channel_id);
      if (channel && channel.isTextBased()) {
        await channel.send({
          embeds: [{
            color: passed ? 0x2ecc71 : 0xe74c3c,
            title: passed ? '🎉 Interview bestanden' : '❌ Interview nicht bestanden',
            description: `**${interview.applicant_name || interview.applicant_id}** hat **${total.toLocaleString('de-DE')}** von **${maxTotal.toLocaleString('de-DE')}** Punkten erreicht.\nBestanden ab **${threshold.toLocaleString('de-DE')}** Punkten.`,
            footer: { text: 'Emergency Hamburg Roleplay • Bewertungsbogen importiert' },
          }],
        });
      }
    } catch (err) {
      logger.warn(`Import-Ergebnis konnte nicht gesendet werden: ${err.message}`);
    }
  }

  await auditService.log(guildId, req.session.user.tag, 'interview.grading_sheet.import', {
    interviewId,
    imported,
    total,
    maxTotal,
    complete,
  });

  return `Bewertungsbogen importiert: ${imported}/${questions.length} Fragen, ${total.toLocaleString('de-DE')} / ${maxTotal.toLocaleString('de-DE')} Punkte.`;
}

async function handleQuestions(req, res) {
  const guildId = req.guildId;
  const body = req.body || {};
  const action = body.action;
  const redirect = `/dashboard/servers/${guildId}/feature/interview`;

  try {
    if (action === 'add') {
      const section = parseInt(body.section, 10) || 1;
      const frage = String(body.frage || '').trim();
      if (frage) {
        const { data: last } = await withRetry(() =>
          getClient().from(TABLES.interviewQuestions).select('sort').eq('guild_id', guildId).eq('section', section).order('sort', { ascending: false }).limit(1)
        );
        const sort = (last && last[0] ? last[0].sort : 0) + 1;
        await withRetry(() => getClient().from(TABLES.interviewQuestions).insert({ guild_id: guildId, section, frage, sort, max_points: 2 }));
        await auditService.log(guildId, req.session.user.tag, 'interview.questions.add', { section, frage });
      }
    }

    if (action === 'edit') {
      const id = Number(body.id);
      const section = parseInt(body.section, 10) || 1;
      const frage = String(body.frage || '').trim();
      if (id && frage) {
        await withRetry(() => getClient().from(TABLES.interviewQuestions).update({ section, frage }).eq('id', id).eq('guild_id', guildId));
        await auditService.log(guildId, req.session.user.tag, 'interview.questions.edit', { id, section });
      }
    }

    if (action === 'delete') {
      const id = Number(body.id);
      if (id) {
        await withRetry(() => getClient().from(TABLES.interviewQuestions).delete().eq('id', id).eq('guild_id', guildId));
        await auditService.log(guildId, req.session.user.tag, 'interview.questions.delete', { id });
      }
    }

    if (action === 'move') {
      const id = Number(body.id);
      const dir = body.dir === 'down' ? 1 : -1;
      if (id) {
        const { data: question } = await withRetry(() =>
          getClient().from(TABLES.interviewQuestions).select('*').eq('id', id).eq('guild_id', guildId).maybeSingle()
        );
        if (question) {
          const { data: peers } = await withRetry(() =>
            getClient().from(TABLES.interviewQuestions).select('*').eq('guild_id', guildId).eq('section', question.section).order('sort', { ascending: true })
          );
          const idx = (peers || []).findIndex((p) => p.id === id);
          const target = idx + dir;
          if (idx !== -1 && target >= 0 && target < peers.length) {
            const a = peers[idx];
            const b = peers[target];
            await withRetry(() => getClient().from(TABLES.interviewQuestions).update({ sort: b.sort }).eq('id', a.id).eq('guild_id', guildId));
            await withRetry(() => getClient().from(TABLES.interviewQuestions).update({ sort: a.sort }).eq('id', b.id).eq('guild_id', guildId));
          }
        }
      }
    }

    if (action === 'import') {
      const message = await importGradingSheet(req, res, guildId, body);
      return res.redirect(`${redirect}?msg=${encodeURIComponent(message)}`);
    }
  } catch (err) {
    logger.error(`Interview-Fragen-Aktion fehlgeschlagen: ${err.stack || err.message}`);
    return res.redirect(`${redirect}?msg=${encodeURIComponent('Import/Änderung fehlgeschlagen.')}`);
  }
  return res.redirect(redirect);
}

module.exports = { handleQuestions };
