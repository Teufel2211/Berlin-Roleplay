const { getClient, TABLES, withRetry } = require('../supabase');
const teamService = require('../services/teamService');
const welcomeService = require('../services/welcomeService');
const auditService = require('../services/auditService');

async function handleAction(req, res) {
  const guildId = req.guildId;
  const feature = req.params.feature;
  const body = req.body || {};
  const redirect = `/dashboard/servers/${guildId}/feature/${feature}`;

  try {
    if (feature === 'team') {
      if (body.action === 'add_member' && body.discord_id) {
        await teamService.upsertMember(guildId, String(body.discord_id), { rank_id: body.rank_id ? Number(body.rank_id) : null, department_id: body.department_id ? Number(body.department_id) : null, status: body.status || 'aktiv', notes: String(body.notes || '').trim() || null });
        await auditService.log(guildId, req.session.user.tag, 'team.member.add', { discord_id: String(body.discord_id) });
      }
      if (body.action === 'remove_member' && body.discord_id) {
        await teamService.removeMember(guildId, String(body.discord_id));
        await auditService.log(guildId, req.session.user.tag, 'team.member.remove', { discord_id: String(body.discord_id) });
      }
      if (body.action === 'promote' && body.discord_id && body.rank_id) {
        await teamService.promoteMember(guildId, String(body.discord_id), Number(body.rank_id), body.department_id ? Number(body.department_id) : null);
        await auditService.log(guildId, req.session.user.tag, 'team.member.promote', { discord_id: String(body.discord_id), rank_id: Number(body.rank_id) });
      }
      if (body.action === 'add_absence' && body.discord_id && body.starts_at && body.ends_at) {
        await teamService.addAbsence(guildId, { discord_id: String(body.discord_id), starts_at: new Date(body.starts_at).toISOString(), ends_at: new Date(body.ends_at).toISOString(), reason: String(body.reason || '').trim() || null });
        await auditService.log(guildId, req.session.user.tag, 'team.absence.add', { discord_id: String(body.discord_id) });
      }
      if (body.action === 'add_department' && String(body.name || '').trim()) await withRetry(() => getClient().from(TABLES.teamDepartments).insert({ guild_id: guildId, name: String(body.name).trim(), description: String(body.description || '').trim() || null }));
      if (body.action === 'add_rank' && String(body.name || '').trim()) await withRetry(() => getClient().from(TABLES.teamRanks).insert({ guild_id: guildId, name: String(body.name).trim(), discord_role_id: String(body.discord_role_id || '').trim() || null, department_id: body.department_id ? Number(body.department_id) : null }));
      if (body.action === 'add_event' && String(body.title || '').trim() && body.starts_at) await teamService.createEvent(guildId, { title: String(body.title).trim(), description: String(body.description || '').trim() || null, starts_at: new Date(body.starts_at).toISOString(), ends_at: body.ends_at ? new Date(body.ends_at).toISOString() : null, location: String(body.location || '').trim() || null, created_by: req.session.user.id });
      if (body.action === 'delete_event' && body.id) await teamService.removeEvent(guildId, Number(body.id));
    }

    if (feature === 'interview' && body.action === 'team_intake' && body.discord_id) {
      const interviewId = Number(body.interview_id) || null;
      let applicationId = null;
      if (interviewId) {
        const { data: interview } = await withRetry(() => getClient().from(TABLES.interviews).select('application_id').eq('id', interviewId).eq('guild_id', guildId).maybeSingle());
        if (interview && interview.application_id) applicationId = Number(interview.application_id);
      }
      await teamService.upsertMember(guildId, String(body.discord_id), { status: 'aktiv', application_id: applicationId, interview_id: interviewId, notes: `Aufgenommen nach bestandenem Interview #${String(body.interview_id || '')}`.trim() });
      await auditService.log(guildId, req.session.user.tag, 'team.member.intake_from_interview', { discord_id: String(body.discord_id), interview_id: interviewId, application_id: applicationId });
    }

    if (feature === 'welcome' && body.action === 'save') {
      const roles = Array.isArray(body.auto_role_ids) ? body.auto_role_ids : body.auto_role_ids ? [body.auto_role_ids] : [];
      const names = Array.isArray(body.field_name) ? body.field_name : body.field_name ? [body.field_name] : [];
      const values = Array.isArray(body.field_value) ? body.field_value : body.field_value ? [body.field_value] : [];
      const inlines = Array.isArray(body.field_inline) ? body.field_inline : body.field_inline ? [body.field_inline] : [];
      const fields = names.map((name, i) => ({ name: String(name || '').trim(), value: String(values[i] || '').trim(), inline: inlines[i] === 'true' || inlines[i] === 'on' })).filter((f) => f.name && f.value);
      await welcomeService.saveConfig(guildId, { channel_id: String(body.channel_id || '').trim() || null, dm_enabled: body.dm_enabled === 'true' || body.dm_enabled === 'on', enabled: body.enabled !== 'false', auto_role_ids: roles, embed_data: { title: String(body.title || 'Willkommen!'), description: String(body.description || 'Willkommen auf {server}, {user}!'), color: String(body.color || '#2B3A67'), image: String(body.image || ''), thumbnail: String(body.thumbnail || ''), fields } });
      await auditService.log(guildId, req.session.user.tag, 'welcome.save', { fields: fields.length });
    }

    if (feature === 'moderation' && body.action === 'clear_warning' && body.id) await withRetry(() => getClient().from(TABLES.moderationWarnings).delete().eq('id', Number(body.id)).eq('guild_id', guildId));
  } catch (err) {
    return res.redirect(`${redirect}?msg=${encodeURIComponent(`Fehler: ${err.message}`)}`);
  }
  return res.redirect(`${redirect}?msg=${encodeURIComponent('Gespeichert')}`);
}

module.exports = { handleAction };
