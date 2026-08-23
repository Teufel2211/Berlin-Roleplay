const { getClient, TABLES, withRetry } = require('../supabase');
const logger = require('../logger');

let started = false;

async function tick(client) {
  const { data: openTickets } = await withRetry(() => getClient().from(TABLES.tickets).select('*').in('status',['open','offen']).not('last_activity_at','is',null).limit(500));
  const now = Date.now();
  for (const ticket of openTickets || []) {
    const { data: settings } = await withRetry(() => getClient().from(TABLES.ticketSettings).select('*').eq('guild_id', ticket.guild_id).maybeSingle());
    if (!settings?.auto_close_enabled) continue;
    const last = new Date(ticket.last_activity_at || ticket.created_at || now).getTime();
    const idle = now - last;
    const hours = Number(settings.auto_close_hours || 72);
    if (idle >= hours * 3600000) {
      await withRetry(() => getClient().from(TABLES.tickets).update({ status:'closed', closed_at:new Date().toISOString(), last_activity_at:new Date().toISOString() }).eq('id',ticket.id));
      const guild=client.guilds.cache.get(ticket.guild_id); const ch=guild?.channels.cache.get(ticket.channel_id);
      if(ch) await ch.send({embeds:[{color:0xFEE75C,title:'🔒 Ticket automatisch geschlossen',description:`Dieses Ticket war ${hours} Stunden inaktiv.`,footer:{text:'Emergency Hamburg Roleplay'}}]}).catch(()=>null);
    } else if (settings.auto_close_warning_hours && idle >= (hours-Number(settings.auto_close_warning_hours))*3600000) {
      const guild=client.guilds.cache.get(ticket.guild_id); const ch=guild?.channels.cache.get(ticket.channel_id);
      if(ch) await ch.send({embeds:[{color:0xFEE75C,title:'⚠️ Ticket wird bald geschlossen',description:`Dieses Ticket wird bei weiterer Inaktivität automatisch geschlossen.`,footer:{text:'Emergency Hamburg Roleplay'}}]}).catch(()=>null);
    }
  }
  const { data: closed } = await withRetry(() => getClient().from(TABLES.tickets).select('*').eq('status','closed').not('closed_at','is',null).limit(500));
  for(const ticket of closed||[]) {
    const {data:settings}=await withRetry(()=>getClient().from(TABLES.ticketSettings).select('*').eq('guild_id',ticket.guild_id).maybeSingle());
    if(!settings?.auto_delete_enabled)continue;
    if(Date.now()-new Date(ticket.closed_at).getTime() < Number(settings.auto_delete_hours||24)*3600000)continue;
    const guild=client.guilds.cache.get(ticket.guild_id); const ch=guild?.channels.cache.get(ticket.channel_id);
    if(ch)await ch.delete().catch(()=>null);
    await withRetry(()=>getClient().from(TABLES.tickets).update({status:'deleted',deleted_at:new Date().toISOString()}).eq('id',ticket.id));
    await withRetry(()=>getClient().from(TABLES.ticketArchives).insert({guild_id:ticket.guild_id,ticket_id:ticket.id,archived_by:'System',reason:'auto-delete'}));
  }
}
function start(client){if(started)return;started=true;setInterval(()=>tick(client).catch(e=>logger.error(`Ticket-Automation: ${e.stack||e.message}`)),60000);tick(client).catch(e=>logger.error(`Ticket-Automation Start: ${e.message}`));}
module.exports={start};
