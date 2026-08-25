const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const service = require('../services/proTicketService');
const embeds = require('../discord/embeds');
const { getClient, TABLES, withRetry } = require('../supabase');

const data = new SlashCommandBuilder().setName('ticket').setDescription('Professionelle Ticket-Verwaltung')
  .addSubcommand(s=>s.setName('setup').setDescription('Ticket-Panel senden').addChannelOption(o=>o.setName('kanal').setDescription('Zielkanal')))
  .addSubcommand(s=>s.setName('create').setDescription('Ticket erstellen').addStringOption(o=>o.setName('kategorie').setDescription('Kategorie-ID').setRequired(true)))
  .addSubcommand(s=>s.setName('close').setDescription('Ticket schließen').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('reopen').setDescription('Ticket wieder öffnen').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('delete').setDescription('Ticket löschen').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('claim').setDescription('Ticket übernehmen').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('unclaim').setDescription('Ticket freigeben').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('add').setDescription('Benutzer hinzufügen').addUserOption(o=>o.setName('benutzer').setDescription('Benutzer').setRequired(true)).addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('remove').setDescription('Benutzer entfernen').addUserOption(o=>o.setName('benutzer').setDescription('Benutzer').setRequired(true)).addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('rename').setDescription('Ticket umbenennen').addStringOption(o=>o.setName('name').setDescription('Neuer Name').setRequired(true)).addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('tag').setDescription('Tag hinzufügen').addIntegerOption(o=>o.setName('tag').setDescription('Tag-ID').setRequired(true)).addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('transcript').setDescription('Transcript erstellen').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')))
  .addSubcommand(s=>s.setName('info').setDescription('Ticket-Info').addStringOption(o=>o.setName('id').setDescription('Ticket-ID')));

async function current(interaction){const {data}=await withRetry(()=>getClient().from(TABLES.tickets).select('id').eq('guild_id',interaction.guild.id).eq('channel_id',interaction.channel.id).maybeSingle());return data?.id;}
const id = async i => i.options.getString('id') || current(i);
module.exports={data,async execute(interaction){if(!interaction.guild)return interaction.reply({embeds:[embeds.error('Nur auf Servern','Dieser Command benötigt einen Discord-Server.',interaction.guild)],flags:64});const sub=interaction.options.getSubcommand();if(sub==='setup'){if(!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))return interaction.reply({embeds:[embeds.error('Keine Berechtigung','Manage Server wird benötigt.',interaction.guild)],flags:64});return service.panel(interaction,interaction.options.getChannel('kanal')?.id||interaction.channel.id);}if(sub==='create')return service.open(interaction,interaction.options.getString('kategorie'));const ticketId=await id(interaction);if(!ticketId)return interaction.reply({embeds:[embeds.error('Kein Ticket','Dieser Kanal ist kein Ticket und es wurde keine ID angegeben.',interaction.guild)],flags:64});if(sub==='close')return service.close(interaction,ticketId);if(sub==='reopen')return service.reopen(interaction,ticketId);if(sub==='delete')return service.deleteTicket(interaction,ticketId);if(sub==='claim')return service.claim(interaction,ticketId);if(sub==='unclaim')return service.unclaim(interaction,ticketId);if(sub==='add')return service.add(interaction,ticketId,interaction.options.getUser('benutzer').id);if(sub==='remove')return service.remove(interaction,ticketId,interaction.options.getUser('benutzer').id);if(sub==='rename')return service.rename(interaction,ticketId,interaction.options.getString('name'));if(sub==='tag')return service.tag(interaction,ticketId,interaction.options.getInteger('tag'));if(sub==='transcript')return service.transcript(interaction,ticketId);return service.info(interaction,ticketId);}};
