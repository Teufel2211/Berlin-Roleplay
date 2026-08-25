const { Events, MessageFlags } = require('discord.js');
const commands = require('../commands');
const logger = require('../logger');
const embeds = require('./embeds');
const { getClient, TABLES, withRetry } = require('../supabase');
const giveawayService = require('../services/giveawayService');
const proTicketService = require('../services/proTicketService');
const ticketAutomation = require('../services/proTicketAutomation');
const ticketChannelSync = require('../services/proTicketChannelSync');
const verifyService = require('../services/verifyService');
const ticketService = require('../services/ticketService');
const applicationService = require('../services/applicationService');
const warteraumService = require('../services/warteraumService');
const interviewService = require('../services/interviewService');
const welcomeService = require('../services/welcomeService');
const settingsService = require('../services/settingsService');

const COMMAND_MODULES = { verify: 'verification', warteraum: 'warteraum', giveaway: 'giveaway', ticket: 'tickets', bewerbung: 'bewerbung', 'bewerbung-verwalten': 'bewerbung', interview: 'interview', team: 'team', moderation: 'moderation' };
async function parseModuleList(raw) { if (raw === undefined || raw === null || raw === '') return null; try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : null; } catch (_) { return null; } }
async function isModuleEnabled(guildId, moduleId) { const all = await settingsService.getAll(guildId).catch(() => ({})); const list = await parseModuleList(all.enabled_modules); return list === null || list.includes(moduleId); }
async function replyError(interaction, err) { logger.error(`Interaktion fehlgeschlagen: ${err.stack || err.message}`); if (!interaction.replied && !interaction.deferred) { try { await interaction.reply({ embeds: [embeds.error('Fehler', 'Beim Ausführen ist ein Fehler aufgetreten.', interaction.guild)], flags: MessageFlags.Ephemeral }); } catch (_) {} } }

function registerEvents(client) {
  client.once(Events.ClientReady, async (c) => { logger.info(`Bot online als ${c.user.tag} in ${c.guilds.cache.size} Server(n)`); await giveawayService.checkExpired(client); giveawayService.startInterval(client); ticketAutomation.start(client); });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) { const cmd = commands.find((c) => c.data.name === interaction.commandName); if (!cmd || typeof cmd.autocomplete !== 'function') return interaction.respond([]); return cmd.autocomplete(interaction); }
      if (interaction.isChatInputCommand()) { const cmd = commands.find((c) => c.data.name === interaction.commandName); if (!cmd) return; const module = COMMAND_MODULES[interaction.commandName]; if (module && !(await isModuleEnabled(interaction.guildId, module))) return interaction.reply({ embeds: [embeds.error('Modul deaktiviert', `Das Modul »${module}« ist auf diesem Server deaktiviert.`, interaction.guild)], flags: MessageFlags.Ephemeral }); return await cmd.execute(interaction); }
      if (interaction.isButton()) { const id = interaction.customId; if (id.startsWith('pt:')) { const [, action, ticketId] = id.split(':'); if(action==='claim')return await proTicketService.claim(interaction,Number(ticketId));if(action==='unclaim')return await proTicketService.unclaim(interaction,Number(ticketId));if(action==='close')return await proTicketService.close(interaction,Number(ticketId));if(action==='reopen')return await proTicketService.reopen(interaction,Number(ticketId));if(action==='delete')return await proTicketService.deleteTicket(interaction,Number(ticketId));if(action==='transcript')return await proTicketService.transcript(interaction,Number(ticketId)); } if(id==='verify_panel')return await verifyService.handlePanelButton(interaction);if(id.startsWith('verify_accept_rules_'))return await verifyService.handleAcceptRules(interaction);if(id==='ticket_panel')return await ticketService.handleOpen(interaction);if(id.startsWith('ticket_close_'))return await ticketService.showCloseModal(interaction);if(id.startsWith('ticket_claim_'))return await ticketService.claim(interaction);if(id.startsWith('app_accept_')||id.startsWith('app_reject_'))return await applicationService.handleDecisionButton(interaction);if(id.startsWith('app_interview_'))return await applicationService.handleInterviewButton(interaction);if(id.startsWith('interview_'))return await interviewService.handleScore(interaction);if(id.startsWith('giveaway_join_'))return await giveawayService.handleJoinButton(interaction);if(id.startsWith('emb_'))return await require('../services/embedInteractionService').handle(interaction); }
      if (interaction.isStringSelectMenu()) { if(interaction.customId==='pt:category')return await proTicketService.categorySelect(interaction);if(interaction.customId==='ticket_type_select')return await ticketService.handleTypeSelect(interaction); }
      if (interaction.isModalSubmit()) { if(interaction.customId.startsWith('pt:questions:'))return await proTicketService.questionModal(interaction);if(interaction.customId.startsWith('ticket_close_modal'))return await ticketService.handleCloseModal(interaction); }
    } catch(err){await replyError(interaction,err);}
  });
  client.on(Events.GuildChannelCreate, (channel)=>{ticketChannelSync.sync(channel).catch(err=>logger.warn(`Ticket-Channel Sync fehlgeschlagen: ${err.message}`));});
  client.on(Events.MessageCreate, async (message)=>{applicationService.handleDmMessage(message).catch(err=>logger.error(`Bewerbungs-DM fehlgeschlagen: ${err.message}`));if(!message.guild||message.author.bot)return;try{const {data:ticket}=await withRetry(()=>getClient().from(TABLES.tickets).select('id,guild_id').eq('guild_id',message.guild.id).eq('channel_id',message.channel.id).maybeSingle());if(ticket){await withRetry(()=>getClient().from(TABLES.tickets).update({last_activity_at:message.createdAt.toISOString()}).eq('id',ticket.id));await withRetry(()=>getClient().from(TABLES.ticketMessages).insert({guild_id:message.guild.id,ticket_id:ticket.id,message_id:message.id,author_id:message.author.id,author_username:message.author.tag,content:message.content||'',attachments:[...message.attachments.values()].map(a=>({name:a.name,url:a.url,size:a.size})),embeds:message.embeds.map(e=>e.toJSON()),created_at:message.createdAt.toISOString()}));}}catch(err){logger.warn(`Ticket-Aktivität konnte nicht gespeichert werden: ${err.message}`);}});
  client.on(Events.GuildMemberAdd,(member)=>{welcomeService.handleMemberJoin(member).catch(err=>logger.error(`Welcome fehlgeschlagen: ${err.message}`));});
  client.on(Events.GuildMemberRemove,async(member)=>{try{await getClient().from(TABLES.users).update({left_at:new Date().toISOString()}).eq('guild_id',member.guild.id).eq('discord_id',member.id);}catch(err){logger.warn(`users-Update bei MemberRemove fehlgeschlagen: ${err.message}`);}await warteraumService.cleanupMember(member.guild.id,member.id);});
}
module.exports={registerEvents};
