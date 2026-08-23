const { MessageFlags } = require('discord.js');
const { getClient, TABLES } = require('../supabase');
const embeds = require('../discord/embeds');
const verifyService = require('./verifyService');
const ticketService = require('./ticketService');
const logger = require('../logger');

async function handle(interaction) {
  const m = /^emb_(\d+)_(\d+)$/.exec(interaction.customId); if (!m) return;
  const { data: row } = await getClient().from(TABLES.embeds).select('*').eq('id',Number(m[1])).eq('guild_id',interaction.guildId).maybeSingle();
  if (!row) return interaction.reply({embeds:[embeds.error('Embed nicht gefunden','Die konfigurierte Aktion ist nicht mehr verfügbar.',interaction.guild)],flags:MessageFlags.Ephemeral});
  let data=row.data; if(typeof data==='string') data=JSON.parse(data); const button=Array.isArray(data?.buttons)?data.buttons[Number(m[2])]:null; if(!button||Number(button.style)===5)return;
  const action=String(button.action||'none'); const value=String(button.action_value||'').trim();
  if(action==='none')return interaction.reply({embeds:[embeds.info('Button','Für diesen Button ist keine Aktion konfiguriert.',interaction.guild)],flags:MessageFlags.Ephemeral});
  if(action==='message')return interaction.reply({content:value||'Die konfigurierte Nachricht ist leer.',flags:MessageFlags.Ephemeral});
  if(action==='verify')return verifyService.handlePanelButton(interaction);
  if(action==='ticket')return ticketService.handleOpen(interaction);
  if(action==='role_add'||action==='role_remove'){const role=interaction.guild.roles.cache.get(value);if(!role)return interaction.reply({embeds:[embeds.error('Rolle nicht gefunden','Die konfigurierte Rolle existiert nicht mehr.',interaction.guild)],flags:MessageFlags.Ephemeral});try{if(action==='role_add')await interaction.member.roles.add(role);else await interaction.member.roles.remove(role);}catch(err){logger.warn(`Embed-Rollenaktion fehlgeschlagen: ${err.message}`);return interaction.reply({embeds:[embeds.error('Rollenaktion fehlgeschlagen','Der Bot konnte die Rolle nicht ändern.',interaction.guild)],flags:MessageFlags.Ephemeral});}return interaction.reply({embeds:[embeds.success(action==='role_add'?'Rolle vergeben':'Rolle entfernt',`<@&${role.id}> wurde ${action==='role_add'?'gegeben':'entfernt'}.`,interaction.guild)],flags:MessageFlags.Ephemeral});}
  return interaction.reply({embeds:[embeds.error('Unbekannte Aktion',`Die Aktion \`${action}\` wird nicht unterstützt.`,interaction.guild)],flags:MessageFlags.Ephemeral});
}
module.exports={handle};
