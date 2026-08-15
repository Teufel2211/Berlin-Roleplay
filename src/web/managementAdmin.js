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
        await teamService.upsertMember(guildId, String(body.discord_id), {
          rank_id: body.rank_id ? Number(body.rank_id) : null,
          department_id: body.department_id ? Number(body.department_id) : null,
          status: body.status || 'aktiv',
          notes: String(body.notes || '').trim() || null,
        });
        await auditService.log(guildId, req.session.user.tag, 'team.member.add', { discord_id: String(body.discord_id) });
      }
      if (body.action === 'remove_member' && body.discord_id) {
        await teamService.removeMember(guildId, String(body.discord_id));
        await auditService.log(guildId, req.session.user.tag, 'team.member.remove', { discord_id: String(body.discord_id) });
      }
      if (body.action === 'add_department' && String(body.name || '').trim()) {
        await withRetry(() => getClient().from(TABLES.teamDepartments).insert({ guild_id: guildId, name: String(body.name).trim(), description: String(body.description || '').trim() || null }));
      }
      if (body.action === 'add_rank' && String(body.name || '').trim()) {
        await withRetry(() => getClient().from(TABLES.teamRanks).insert({ guild_id: guildId, name: String(body.name).trim(), discord_role_id: String(body.discord_role_id || '').trim() || null, department_id: body.department_id ? Number(body.department_id) : null }));
      }
    }

    if (feature === 'calendar' && body.action === 'add_event' && String(body.title || '').trim() && body.starts_at) {
      await teamService.createEvent(guildId, {
        title: String(body.title).trim(),
        description: String(body.description || '').trim() || null,
        starts_at: new Date(body.starts_at).toISOString(),
        ends_at: body.ends_at ? new Date(body.ends_at).toISOString() : null,
        location: String(body.location || '').trim() || null,
        created_by: req.session.user.id,
      });
    }

    if (feature === 'welcome' && body.action === 'save') {
      const roles = Array.isArray(body.auto_role_ids) ? body.auto_role_ids : body.auto_role_ids ? [body.auto_role_ids] : [];
      await welcomeService.saveConfig(guildId, {
        channel_id: String(body.channel_id || '').trim() || null,
        dm_enabled: body.dm_enabled === 'true' || body.dm_enabled === 'on',
        enabled: body.enabled !== 'false' && body.enabled !== undefined,
        auto_role_ids: roles,
        embed_data: {
          title: String(body.title || 'Willkommen!'),
          description: String(body.description || 'Willkommen auf {server}, {user}!'),
          color: String(body.color || '#2B3A67'),
          image: String(body.image || ''),
          thumbnail: String(body.thumbnail || ''),
        },
      });
      await auditService.log(guildId, req.session.user.tag, 'welcome.save', {});
    }

    if (feature === 'moderation' && body.action === 'clear_warning' && body.id) {
      await withRetry(() => getClient().from(TABLES.moderationWarnings).delete().eq('id', Number(body.id)).eq('guild_id', guildId));
    }
  } catch (err) {
    return res.redirect(`${redirect}?msg=${encodeURIComponent(`Fehler: ${err.message}`)}`);
  }
  return res.redirect(`${redirect}?msg=${encodeURIComponent('Gespeichert')}`);
}

module.exports = { handleAction };
