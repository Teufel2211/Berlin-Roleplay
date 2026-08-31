import "dotenv/config";
import { ActivityType, Client, Events } from "discord.js";
import { loadConfig } from "./core/config.js";
import { createLogger } from "./core/logger.js";
import { createDbClient } from "./core/db.js";
import { SettingsService } from "./core/settingsService.js";
import { AuditService } from "./core/audit.js";
import { GuildsService } from "./core/guilds.js";
import { EventRouter } from "./core/eventRouter.js";
import { InteractionRouter } from "./core/interactions/router.js";
import { CommandDispatcher } from "./core/commandDispatcher.js";
import { Registry } from "./core/registry.js";
import { adminModule } from "./modules/admin.js";
import { CommandDeployer } from "./core/commands/deploy.js";
import { BOT_INTENTS } from "./core/client.js";
import { ErlcService } from "./erlc/service.js";
import { erlcModule } from "./erlc/module.js";
import { ErlcWebhookHandler } from "./erlc/webhook.js";
import { GiveawayService } from "./giveaway/service.js";
import { giveawayModule } from "./giveaway/module.js";
import { TicketService } from "./ticket/service.js";
import { ticketModule } from "./ticket/module.js";
import { welcomeModule } from "./modules/welcome.js";
import { verifyModule } from "./modules/verify.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, "bot");
  const db = createDbClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const settingsService = new SettingsService(db);
  const auditService = new AuditService(db);
  const client = new Client({
    intents: BOT_INTENTS,
    presence: { activities: [{ name: "Berlin Roleplay", type: ActivityType.Watching }] },
  });

  const eventRouter = new EventRouter();
  const interactionRouter = new InteractionRouter();
  const commandDispatcher = new CommandDispatcher(settingsService);
  const guildsService = new GuildsService(db, settingsService, logger);
  const erlcService = new ErlcService(db, logger);
  const giveawayService = new GiveawayService(db);
  const ticketService = new TicketService(db);
  const registry = new Registry(client, eventRouter, interactionRouter, commandDispatcher);

  // Grund-Event-Handler
  client.once(Events.ClientReady, (c) => {
    logger.info(`Bot bereit als ${c.user.tag}`);
  });
  client.on(Events.GuildCreate, (g) => {
    void guildsService.ensure(g);
  });
  client.on(Events.GuildDelete, (g) => {
    guildsService.forget(g.id);
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        const handled = await interactionRouter.route(interaction.customId, interaction);
        if (!handled) {
          logger.warn(`Unbekannte customId: ${interaction.customId}`);
        }
      } else if (interaction.isChatInputCommand()) {
        const handled = await commandDispatcher.route(interaction);
        if (!handled) {
          logger.warn(`Unbekannter Slash-Command: /${interaction.commandName}`);
          await interaction.reply({
            content: `Das Kommando \`/${interaction.commandName}\` ist noch nicht registriert.`,
            flags: 64, // Ephemeral
          });
        }
      }
    } catch (err) {
      logger.error(`Interaction-Fehler: ${String(err)}`);
      if ("reply" in interaction) {
        await interaction
          .reply({ content: "Ein interner Fehler ist aufgetreten.", flags: 64 })
          .catch(() => {});
      }
    }
  });
  client.on(Events.Error, (err) => {
    logger.error(`Discord-Client-Fehler: ${err.message}`);
  });

  // Registry (Module) initialisieren, dann verbinden.
  registry.add(adminModule(guildsService));
  registry.add(erlcModule(erlcService));
  registry.add(giveawayModule(giveawayService));
  registry.add(ticketModule(ticketService, settingsService));
  registry.add(welcomeModule(settingsService));
  registry.add(verifyModule(settingsService));
  await registry.init();
  await client.login(config.discordToken);
  logger.info("Bot gestartet.");

  // ER:LC-Polling + Panel-Refresh an den Client binden und starten (nur bei echten Servern sinnvoll).
  erlcService.attach(client);
  erlcService.start(60);

  // ER:LC-Webhook-Listener (nur wenn Public-Key in .env konfiguriert).
  if (config.erlcWebhookPublicKey) {
    const webhook = new ErlcWebhookHandler(db, logger, config.erlcWebhookPublicKey);
    await webhook.listen(config.webhookPort);
  }

  // Guilds warmfahren (Provisionierung).
  await guildsService.warmUp(client);

  // Slash-Command-Deploy (guild-scoped falls GUILD_ID gesetzt, sonst global).
  if (client.application?.id) {
    const deployer = new CommandDeployer(
      client.application.id,
      config.discordToken,
      config.guildId,
      logger,
    );
    await deployer.deploy(registry.allCommands());
  } else {
    logger.warn("client.application.id fehlt – Command-Deploy übersprungen.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});