const { PermissionFlagsBits } = require('discord.js');
const { getClient, TABLES, withRetry } = require('../supabase');

function ids(value){return Array.isArray(value)?value.map(String):value?[String(value)]:[];}
async function sync(channel){if(!channel?.guild)return;for(let attempt=0;attempt<3;attempt++){const {data:ticket}=await withRetry(()=>getClient().from(TABLES.tickets).select('id,category_id,owner_id').eq('guild_id',channel.guild.id).eq('channel_id',channel.id).maybeSingle());if(ticket){const {data:category}=await withRetry(()=>getClient().from(TABLES.ticketCategories).select('support_role_ids,admin_role_ids').eq('guild_id',channel.guild.id).eq('id',ticket.category_id).maybeSingle());if(category){const roles=[...ids(category.support_role_ids),...ids(category.admin_role_ids)];for(const roleId of roles){if(channel.guild.roles.cache.has(roleId))await channel.permissionOverwrites.edit(roleId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}).catch(()=>null);} }return;}await new Promise(r=>setTimeout(r,500));}}
module.exports={sync};
