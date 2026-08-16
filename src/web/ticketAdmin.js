const ticketTypeService = require('../services/ticketTypeService');
const auditService = require('../services/auditService');
const logger = require('../logger');

async function handleTypes(req, res) {
  const guildId = req.guildId;
  const body = req.body || {};
  const action = body.action;
  const redirect = `/dashboard/servers/${guildId}/feature/tickets`;

  try {
    if (action === 'add') {
      const name = String(body.name || '').trim();
      if (name) {
        const type = await ticketTypeService.create(guildId, {
          name,
          emoji: String(body.emoji || '🎫').trim() || '🎫',
          category_id: String(body.category_id || '').trim() || null,
          max_open: Math.max(1, parseInt(body.max_open, 10) || 1),
          ping_role_id: String(body.ping_role_id || '').trim() || null,
        });
        await auditService.log(guildId, req.session.user.tag, 'ticket.types.add', { id: type.id, name: type.name });
      }
    }

    if (action === 'edit') {
      const id = Number(body.id);
      const name = String(body.name || '').trim();
      if (id && name) {
        const type = await ticketTypeService.update(guildId, id, {
          name,
          emoji: String(body.emoji || '').trim() || '🎫',
          category_id: String(body.category_id || '').trim() || null,
          max_open: Math.max(1, parseInt(body.max_open, 10) || 1),
          ping_role_id: String(body.ping_role_id || '').trim() || null,
        });
        await auditService.log(guildId, req.session.user.tag, 'ticket.types.edit', { id: type.id, name: type.name });
      }
    }

    if (action === 'delete') {
      const id = Number(body.id);
      if (id) {
        await ticketTypeService.remove(guildId, id);
        await auditService.log(guildId, req.session.user.tag, 'ticket.types.delete', { id });
      }
    }

    if (action === 'move') {
      const id = Number(body.id);
      if (id) {
        await ticketTypeService.move(guildId, id, body.dir === 'down' ? 'down' : 'up');
        await auditService.log(guildId, req.session.user.tag, 'ticket.types.move', { id });
      }
    }
  } catch (err) {
    logger.error(`Ticket-Typen-Aktion fehlgeschlagen: ${err.stack || err.message}`);
    return res.redirect(`${redirect}?msg=${encodeURIComponent('Änderung fehlgeschlagen.')}`);
  }
  return res.redirect(redirect);
}

module.exports = { handleTypes };
