const { Events, MessageFlags } = require('discord.js');
const commands = require('../commands');
const logger = require('../logger');
const embeds = require('./embeds');
const { getClient, TABLES } = require('../supabase');
const giveawayService = require('../services/giveawayService');
const verifyService = require('../services/verifyService');
const ticketService = require('../services/ticketService');
const applicationService = require('../services/applicationService');
const warteraumService = require('../services/warteraumService');
const interviewService = require('../services/interviewService');
const welcomeService = require('../services/welcomeService');
const settingsService = require('../services/settingsService');

const COMMAND_MODULES = { verify: 'verification', warteraum: 'warteraum', giveaway: 'giveaway', bewerbung: 'bewerbung', 'bewerbung-verwalten': 'bewerbung', ticket: 'tickets', interview: 'interview', team: 'team', moderation: 'moderation' };

async function parseModuleList(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(String).filter(Boolean) : null; } catch (_) { return null; }
}
async function isModuleEnabled(guildId, moduleId) { const all = await settingsService.getAll(guildId).catch(() => ({})); const list = await parseModuleList(all.enabled_modules); return list === null || list.includes(moduleId); }
async function replyError(interaction, err) { logger.error(`Interaktion fehlgeschlagen: ${err.stack || err.message}`); if (!interaction.replied && !interaction.deferred) { try { await interaction.reply({ embeds: [embeds.error('Fehler', 'Beim Ausführen ist ein Fehler aufgetreten.', interaction.guild)], flags: MessageFlags.Ephemeral }); } catch (_) {} } }

async function handleEmbedButton(interaction) {
  const match = /^emb_(\d+)_(\d+)$/.exec(interaction.customId);
  if (!match) return;
  const embedId = Number(match[1]);
  const index = Number(match[2]);
  const { data: row } = await getClient().from(TABLES.embeds).select('*').eq('id', embedId).eq('guild_id', interaction.guildId).maybeSingle();
  if (!row) return interaction.reply({ embeds: [embeds.error('Embed nicht gefunden', 'Die konfigurierte Aktion ist nicht mehr verfügbar.', interaction.guild)], flags: MessageFlags.Ephemeral });
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  const button = Array.isArray(data.buttons) ? data.buttons[index] : null;
  if (!button || Number(button.style) === 5) return;

  const action = String(button.action || 'none');
  const value = String(button.action_value || '').trim();
  if (action === 'none') return interaction.reply({ embeds: [embeds.info('Button', 'Für diesen Button ist keine Aktion konfiguriert.', interaction.guild)], flags: MessageFlags.Ephemeral });
  if (action === 'message') return interaction.reply({ content: value || 'Die konfigurierte Nachricht ist leer.', flags: MessageFlags.Ephemeral });
  if (action === 'verify') return verifyService.handlePanelButton(interaction);
  if (action === 'ticket') return ticketService.handleOpen(interaction);

  if (action === 'role_add' || action === 'role_remove') {
    if (!/^\d{15,25}$/.test(value)) return interaction.reply({ embeds: [embeds.error('Rolle fehlt', 'Für diese Button-Aktion wurde keine gültige Rollen-ID hinterlegt.', interaction.guild)], flags: MessageFlags.Ephemeral });
    const role = interaction.guild.roles.cache.get(value);
    if (!role) return interaction.reply({ embeds: [embeds.error('Rolle nicht gefunden', 'Die konfigurierte Rolle existiert nicht mehr.', interaction.guild)], flags: MessageFlags.Ephemeral });
    try {
      if (action === 'role_add') await interaction.member.roles.add(role);
      else await interaction.member.roles.remove(role);
    } catch (err) {
      logger.warn(`Embed-Rollenaktion fehlgeschlagen: ${err.message}`);
      return interaction.reply({ embeds: [embeds.error('Rollenaktion fehlgeschlagen', 'Der Bot konnte die Rolle nicht ändern. Prüfe seine Rollenposition und Berechtigungen.', interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [embeds.success(action === 'role_add' ? 'Rolle vergeben' : 'Rolle entfernt', action === 'role_add' ? `<@&${role.id}> wurde dir gegeben.` : `<@&${role.id}> wurde dir entfernt.`, interaction.guild)], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ embeds: [embeds.error('Unbekannte Aktion', `Die Aktion \`${action}\` wird nicht unterstützt.`, interaction.guild)], flags: MessageFlags.Ephemeral });
}

function registerEvents(client) {
  client.once(Events.ClientReady, async (c) => { logger.info(`Bot online als ${c.user.tag} in ${c.guilds.cache.size} Server(n)`); await giveawayService.checkExpired(client); giveawayService.startInterval(client); });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const cmd = commands.find((c) => c.data.name === interaction.commandName);
        if (!cmd || typeof cmd.autocomplete !== 'function') return interaction.respond([]);
        return await cmd.autocomplete(interaction);
      }
      if (interaction.isChatInputCommand()) {
        const cmd = commands.find((c) => c.data.name === interaction.commandName); if (!cmd) return;
        const module = COMMAND_MODULES[interaction.commandName];
        if (module && !(await isModuleEnabled(interaction.guildId, module))) return interaction.reply({ embeds: [embeds.error('Modul deaktiviert', `Das Modul »${module}« ist auf diesem Server deaktiviert.`, interaction.guild)], flags: MessageFlags.Ephemeral });
        return await cmd.execute(interaction);
      }
      if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === 'verify_panel') return await verifyService.handlePanelButton(interaction);
        if (id.startsWith('verify_accept_rules_')) return await verifyService.handleAcceptRules(interaction);
        if (id === 'ticket_panel') return await ticketService.handleOpen(interaction);
        if (id.startsWith('ticket_close_')) return await ticketService.showCloseModal(interaction);
        if (id.startsWith('app_accept_') || id.startsWith('app_reject_')) return await applicationService.handleDecisionButton(interaction);
        if (id.startsWith('app_interview_')) return await applicationService.handleInterviewButton(interaction);
        if (id.startsWith('interview_')) return await interviewService.handleScore(interaction);
        if (id.startsWith('giveaway_join_')) return await giveawayService.handleJoinButton(interaction);
        if (id.startsWith('emb_')) return await handleEmbedButton(interaction);
        return;
      }
      if (interaction.isStringSelectMenu()) { if (interaction.customId === 'ticket_type_select') return await ticketService.handleTypeSelect(interaction); return; }
      if (interaction.isModalSubmit()) { const id = interaction.customId; if (id.startsWith('ticket_close_modal')) return await ticketService.handleCloseModal(interaction); return; }
    } catch (err) { await replyError(interaction, err); }
  });
  client.on(Events.MessageCreate, (message) => { applicationService.handleDmMessage(message).catch((err) => logger.error(`Bewerbungs-DM fehlgeschlagen: ${err.message}`)); });
  client.on(Events.GuildMemberAdd, (member) => { welcomeService.handleMemberJoin(member).catch((err) => logger.error(`Welcome fehlgeschlagen: ${err.message}`)); });
  client.on(Events.GuildMemberRemove, async (member) => { try { await getClient().from(TABLES.users).update({ left_at: new Date().toISOString() }).eq('guild_id', member.guild.id).eq('discord_id', member.id); } catch (err) { logger.warn(`users-Update bei MemberRemove fehlgeschlagen: ${err.message}`); } await warteraumService.cleanupMember(member.guild.id, member.id); });
}
module.exports = { registerEvents };
