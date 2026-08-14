const { getClient, TABLES, withRetry } = require('../supabase');
const logger = require('../logger');
const auditService = require('../services/auditService');

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
        await withRetry(() => getClient().from(TABLES.interviewQuestions).insert({ guild_id: guildId, section, frage, sort }));
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
  } catch (err) {
    logger.error(`Interview-Fragen-Aktion fehlgeschlagen: ${err.stack || err.message}`);
  }
  return res.redirect(redirect);
}

module.exports = { handleQuestions };
