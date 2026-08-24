const settingsService = require('../services/settingsService');
const auditService = require('../services/auditService');
const logger = require('../logger');
const ticketService = require('../services/proTicketService');
const { getClient, TABLES, withRetry } = require('../supabase');
const { config } = require('../config');

async function getApi(req, res) {
  try {
    const guildId = req.guildId;
    if (req.query.ticket === '1') {
      const [ticketSettings, categories, priorities, tags, stats, tickets, transcripts] = await Promise.all([
        ticketService.settings(guildId), ticketService.categories(guildId, true), ticketService.priorities(guildId), ticketService.tags(guildId),
        ticketService.stats(guildId), ticketService.list(guildId, { status: req.query.status || '', categoryId: req.query.category || '', assigned: req.query.assigned || '', priorityId: req.query.priority || '', searchText: req.query.search || '', offset: Number(req.query.offset || 0) }),
        ticketService.transcripts(guildId, { ticketId: req.query.ticketId || '', userId: req.query.userId || '' }),
      ]);
      const { data: events } = await withRetry(() => getClient().from(TABLES.ticketEvents).select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(100));
      const { data: panel } = await withRetry(() => getClient().from(TABLES.ticketPanels).select('*').eq('guild_id', guildId).order('id').limit(1).maybeSingle());
      const { data: questions } = await withRetry(() => getClient().from(TABLES.ticketQuestions).select('*').eq('guild_id', guildId).order('category_id').order('sort_order'));
      return res.json({ settings: ticketSettings, categories, priorities, tags, stats, tickets, transcripts, events: events || [], panel: panel || null, questions: questions || [] });
    }
    res.json(await settingsService.getAll(guildId));
  } catch (err) { logger.error(`Settings-API fehlgeschlagen: ${err.stack || err.message}`); res.status(500).json({ error: 'Datenbank-Fehler' }); }
}

async function applyChanges(guildId, user, settings) {
  if (!settings || typeof settings !== 'object') return;
  const before = await settingsService.getAll(guildId); const entries = {};
  for (const [k, v] of Object.entries(settings)) if (k.trim()) entries[k.trim()] = Array.isArray(v) ? JSON.stringify(v.map(String).filter(Boolean)) : String(v ?? '');
  if (!Object.keys(entries).length) return;
  await settingsService.setMany(guildId, entries); const changes = {};
  for (const [k, v] of Object.entries(entries)) if ((before[k] || '') !== v) changes[k] = { vorher: before[k] || '', nachher: v };
  if (Object.keys(changes).length) await auditService.log(guildId, user, 'settings.update', changes);
}

function panelComponents(panel, cats) {
  const title = panel?.title || '🎫 Support';
  const description = panel?.description || 'Wähle eine Kategorie, um ein Ticket zu erstellen.';
  const footer = panel?.footer || 'Emergency Hamburg Roleplay';
  const colorRaw = Number(panel?.color);
  const accent = Number.isFinite(colorRaw) && colorRaw > 0 ? colorRaw : 5793266;
  const children = [];
  if (panel?.thumbnail) children.push({ type: 9, accessory: { type: 11, media: { url: panel.thumbnail }, description: 'Thumbnail' }, components: [{ type: 10, content: `# ${title}` }, { type: 10, content: description }] });
  else { children.push({ type: 10, content: `# ${title}` }); if (description) children.push({ type: 10, content: description }); }
  if (panel?.banner) children.push({ type: 12, items: [{ media: { url: panel.banner }, description: 'Banner' }] });
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 1, components: [{ type: 3, custom_id: 'pt:category', placeholder: 'Ticket-Kategorie auswählen', options: cats.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id), description: String(c.description || 'Ticket erstellen').slice(0, 100), emoji: c.emoji ? { name: c.emoji } : undefined })) }] });
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 10, content: `-# ${footer}` });
  return [{ type: 17, accent_color: accent, components: children }];
}

async function sendPanel(guildId, channelId, userTag) {
  const s = await ticketService.settings(guildId); const cats = await ticketService.categories(guildId); if (!cats.length) throw new Error('Keine Ticket-Kategorien aktiviert.');
  const { data: panel } = await withRetry(() => getClient().from(TABLES.ticketPanels).select('*').eq('guild_id', guildId).eq('enabled', true).order('id').limit(1).maybeSingle());
  const payload = { flags: 32768, components: panelComponents(panel, cats) };
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, { method:'POST', headers:{ Authorization:`Bot ${config.discordToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(payload) }); if(!r.ok) throw new Error(`Discord API ${r.status}: ${await r.text()}`); const msg=await r.json(); await auditService.log(guildId,userTag,'ticket.panel.send',{channelId,messageId:msg.id}); return msg.id;
}

async function ticketAction(req, guildId, user) {
  const a=req.body?.ticketAction; const body=req.body?.ticket||{}; if(!a)return false;
  if(a==='settings') await ticketService.saveSettings(guildId,{prefix:String(body.prefix||'ticket'),number_start:Number(body.number_start||1),default_ticket_limit:Number(body.default_ticket_limit||1),auto_close_hours:Number(body.auto_close_hours||72),auto_close_warning_hours:Number(body.auto_close_warning_hours||24),auto_delete_hours:Number(body.auto_delete_hours||24),transcript_channel_id:body.transcript_channel_id||null,log_channel_id:body.log_channel_id||null,auto_close_enabled:body.auto_close_enabled==='true',auto_delete_enabled:body.auto_delete_enabled==='true',transcript_enabled:body.transcript_enabled==='true',transcript_on_close:body.transcript_on_close==='true',transcript_on_delete:body.transcript_on_delete==='true',claim_single:body.claim_single==='true'});
  else if(a==='category_save') await ticketService.upsertCategory(guildId,body);
  else if(a==='category_delete') await ticketService.deleteCategory(guildId,Number(body.id));
  else if(a==='priority_save'){const row={guild_id:guildId,name:String(body.name||'Priorität'),emoji:String(body.emoji||'🔵'),color:Number(body.color||5793266),sort_order:Number(body.sort_order||0),enabled:true};if(body.id)await withRetry(()=>getClient().from(TABLES.ticketPriorities).update(row).eq('guild_id',guildId).eq('id',Number(body.id)));else await withRetry(()=>getClient().from(TABLES.ticketPriorities).insert(row));}
  else if(a==='tag_save'){const row={guild_id:guildId,name:String(body.name||'Tag'),emoji:String(body.emoji||'🏷️'),color:Number(body.color||8421504),description:String(body.description||'')||null,enabled:true};if(body.id)await withRetry(()=>getClient().from(TABLES.ticketTags).update(row).eq('guild_id',guildId).eq('id',Number(body.id)));else await withRetry(()=>getClient().from(TABLES.ticketTags).insert(row));}
  else if(a==='question_save'){const row={guild_id:guildId,category_id:Number(body.category_id),question:String(body.question||'').slice(0,1000),type:['short','long','choice','boolean','number'].includes(body.type)?body.type:'short',options:String(body.options||'').split('\n').filter(Boolean),required:body.required!=='false',sort_order:Number(body.sort_order||0),enabled:true};if(body.id)await withRetry(()=>getClient().from(TABLES.ticketQuestions).update(row).eq('guild_id',guildId).eq('id',Number(body.id)));else await withRetry(()=>getClient().from(TABLES.ticketQuestions).insert(row));}
  else if(a==='question_delete') await withRetry(()=>getClient().from(TABLES.ticketQuestions).delete().eq('guild_id',guildId).eq('id',Number(body.id)));
  else if(a==='panel_save') await ticketService.savePanel(guildId,body);
  else if(a==='panel_send') await sendPanel(guildId,String(body.channel_id),user);
  await auditService.log(guildId,user,`ticket.${a}`,body); return true;
}

async function saveApi(req,res){try{if(req.body?.ticketAction){await ticketAction(req,req.guildId,req.session.user.tag);return res.json({ok:true});}await applyChanges(req.guildId,req.session.user.tag,req.body?.settings);res.json({ok:true});}catch(err){logger.error(`Settings-API-Save fehlgeschlagen: ${err.stack||err.message}`);const msg=String(err.message||'Speichern fehlgeschlagen').slice(0,200);res.status(400).json({error:msg});}}
async function saveForm(req,res){try{await applyChanges(req.guildId,req.session.user.tag,req.body?.settings);}catch(err){logger.error(`Settings-Save fehlgeschlagen: ${err.message}`);}res.redirect(`/dashboard/servers/${req.guildId}/feature/${req.params.feature||'overview'}`);}
module.exports={getApi,saveApi,saveForm};
