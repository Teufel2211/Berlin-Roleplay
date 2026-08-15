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

async function replyError(interaction, err) {
  logger.error(`Interaktion fehlgeschlagen: ${err.stack || err.message}`);
  if (!interaction.replied && !interaction.deferred) {
    try {
      await interaction.reply({ embeds: [embeds.error('Fehler', 'Beim Ausführen ist ein Fehler aufgetreten.', interaction.guild)], flags: MessageFlags.Ephemeral });
    } catch (_) { /* ignorieren */ }
  }
}

function registerEvents(client) {
  client.once(Events.ClientReady, async (c) => {
    logger.info(`Bot online als ${c.user.tag} in ${c.guilds.cache.size} Server(n)`);
    await giveawayService.checkExpired(client);
    giveawayService.startInterval(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commands.find((c) => c.data.name === interaction.commandName);
        if (cmd) return await cmd.execute(interaction);
        return;
      }
      if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === 'verify_panel') return await verifyService.handlePanelButton(interaction);
        if (id === 'ticket_panel') return await ticketService.handleOpen(interaction);
        if (id.startsWith('ticket_close_')) return await ticketService.showCloseModal(interaction);
        if (id.startsWith('app_accept_') || id.startsWith('app_reject_')) return await applicationService.handleDecisionButton(interaction);
        if (id.startsWith('interview_')) return await interviewService.handleScore(interaction);
        if (id.startsWith('emb_')) return interaction.reply({ embeds: [embeds.info('Embed-Button', 'Für diesen Button ist keine Aktion konfiguriert.', interaction.guild)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;
        if (id.startsWith('app_form_')) return await applicationService.handleModalSubmit(interaction);
        if (id.startsWith('ticket_close_modal')) return await ticketService.handleCloseModal(interaction);
        return;
      }
    } catch (err) {
      await replyError(interaction, err);
    }
  });

  client.on(Events.GuildMemberAdd, (member) => {
    welcomeService.handleMemberJoin(member).catch((err) => logger.error(`Welcome fehlgeschlagen: ${err.message}`));
  });

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    giveawayService.handleReaction(reaction, user).catch((err) => logger.error(`Giveaway-Reaktion fehlgeschlagen: ${err.message}`));
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    giveawayService.handleReactionRemove(reaction, user).catch((err) => logger.error(`Giveaway-Reaktion entfernt fehlgeschlagen: ${err.message}`));
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await getClient().from(TABLES.users).update({ left_at: new Date().toISOString() }).eq('guild_id', member.guild.id).eq('discord_id', member.id);
    } catch (err) {
      logger.warn(`users-Update bei MemberRemove fehlgeschlagen: ${err.message}`);
    }
    await warteraumService.cleanupMember(member.guild.id, member.id);
  });
}

module.exports = { registerEvents };
