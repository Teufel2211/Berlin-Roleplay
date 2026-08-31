import { ChannelType } from "discord.js";
import { V2MessageBuilder, findCommand, type V2Layout } from "@berlin/shared";
import { type BotModule } from "../core/registry.js";
import { type SlashContext } from "../core/commandDispatcher.js";
import { type ErlcService } from "./service.js";
import { replyV2, v2LayoutReply } from "../core/messages.js";

/** ER:LC-Modul: alle Slash-Subcommands gegen den Polling-Service. */
export function erlcModule(service: ErlcService): BotModule {
  return {
    name: "erlc",
    register({ commands }) {
      const def = findCommand("erlc")!;

      const requireServer = async (
        ctx: SlashContext,
      ): Promise<NonNullable<Awaited<ReturnType<ErlcService["firstServer"]>>> | null> => {
        const server = await service.firstServer(ctx.interaction.guildId!);
        if (!server) {
          await replyV2(ctx.interaction, "Kein ER:LC-Server für diese Guild konfiguriert (Server muss in der DB hinterlegt sein).");
          return null;
        }
        return server;
      };

      const getClient = async (ctx: SlashContext): Promise<Awaited<ReturnType<ErlcService["clientForGuild"]>>> => {
        const client = await service.clientForGuild(ctx.interaction.guildId!);
        if (!client) {
          await replyV2(ctx.interaction, "Kein ER:LC-Server für diese Guild konfiguriert.");
        }
        return client;
      };

      const textBlock = (lines: string[], empty: string): { type: "text"; content: string; style: "paragraph" } => ({
        type: "text",
        content: lines.length ? lines.join("\n") : empty,
        style: "paragraph",
      });

      /** V2-Layout für interaction.reply bauen. */
      const replyLayout = (layout: V2Layout) => {
        return v2LayoutReply(layout, false);
      };

      // --- status -----------------------------------------------------------
      commands.register(def, { name: "status", description: "Serverstatus anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const client = await getClient(ctx);
        if (!client) return;
        const info = await client.fetchServer();
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Ã°Å¸â€“Â¥Ã¯Â¸Â ${info.name}` },
            { type: "text", content: `Ã°Å¸Å¸Â¢ Online Ã‚Â· **${info.players}/${info.maxPlayers}** Spieler Ã‚Â· Warteschlange: ${info.queue}` },
            { type: "text", content: `Karte: **${info.currentMap}** Ã‚Â· Modded: ${info.modded ? "Ja" : "Nein"}` },
            { type: "separator", line: true },
            { type: "text", content: `Version ${info.version} Ã‚Â· FPS ${info.fps}` },
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- players ----------------------------------------------------------
      commands.register(def, { name: "players", description: "Spielerliste anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const client = await getClient(ctx);
        if (!client) return;
        const players = await client.fetchPlayers();
        const lines = players
          .slice(0, 20)
          .map(
            (p) =>
              `${p.duty ? "Ã°Å¸Å¸Â¢" : "Ã¢Å¡Âª"} **${p.name}** (${p.rankId ?? "Ã¢â‚¬â€"})${p.factionId ? ` Ã‚Â· ${p.factionId}` : ""}`,
          );
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Ã°Å¸â€˜Â¥ Spieler (${players.length})` },
            textBlock(lines, "Keine Spieler online."),
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- staff ------------------------------------------------------------
      commands.register(def, { name: "staff", description: "Staff-Liste anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const client = await getClient(ctx);
        if (!client) return;
        const players = await client.fetchPlayers();
        const staff = players.filter((p) => p.permission !== "regular");
        const lines = staff.map((p) => `**${p.name}** Ã¢â‚¬â€ ${p.permission}`);
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Ã°Å¸â€ºÂ¡Ã¯Â¸Â Staff (${staff.length})` },
            textBlock(lines, "Kein Staff online."),
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- factions ---------------------------------------------------------
      commands.register(def, { name: "factions", description: "Faktionen anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const client = await getClient(ctx);
        if (!client) return;
        const factions = await client.fetchFactions();
        const lines = factions.map((f) => `**${f.name}** [${f.tag}]`);
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Ã°Å¸Ââ€ºÃ¯Â¸Â Faktionen (${factions.length})` },
            textBlock(lines, "Keine Faktionen."),
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- ranks ------------------------------------------------------------
      commands.register(def, { name: "ranks", description: "RÃƒÂ¤nge anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const client = await getClient(ctx);
        if (!client) return;
        const factions = await client.fetchFactions();
        const lines = factions.flatMap((f) => (f.roles ?? []).map((r) => `**${f.tag}** Ã‚Â· ${r.name}`));
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: "Ã°Å¸Å½â€“Ã¯Â¸Â RÃƒÂ¤nge" },
            textBlock(lines, "Keine RÃƒÂ¤nge."),
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- join / leave -----------------------------------------------------
      commands.register(def, { name: "join", description: "Dem Server beitreten" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        await replyV2(ctx.interaction, "Server-Join erfolgt über die ER:LC-Client (in der jeweiligen Guild-Konfiguration).");
      });
      commands.register(def, { name: "leave", description: "Server verlassen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        await replyV2(ctx.interaction, "Server-Leave erfolgt über die ER:LC-Client (in der jeweiligen Guild-Konfiguration).");
      });

      // --- duty -------------------------------------------------------------
      commands.register(def, { name: "duty", description: "Dienst beginnen/beenden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const aktion = ctx.interaction.options.data.find((o) => o.name === "aktion")?.value as "start" | "end" | undefined;
        const duty = aktion === "start";
        await service.setDuty(ctx.interaction.guildId!, ctx.interaction.user.id, server, ctx.interaction.user.id, duty);
        await replyV2(ctx.interaction, duty
          ? `✅ Dienst begonnen (${new Date().toLocaleTimeString("de-DE")}).`
          : "⏹️ Dienst beendet.");
      });

      // --- incident ---------------------------------------------------------
      commands.register(def, { name: "incident", description: "Vorfall erstellen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const beschreibung = ctx.interaction.options.getString("beschreibung") ?? "";
        const incident = await service.createIncident({
          guildId: ctx.interaction.guildId!,
          serverId: server.id,
          createdBy: ctx.interaction.user.id,
          description: beschreibung,
        });
        await replyV2(ctx.interaction, `🚨 Vorfall erstellt (ID \`${incident.id.slice(0, 8)}\`).`);
      });

      commands.register(def, { name: "incident-close", description: "Vorfall schlieÃƒÅ¸en" }, async (ctx) => {
        const incidents = await service.openIncidents(ctx.interaction.guildId!);
        if (incidents.length === 0) {
          await replyV2(ctx.interaction, "Keine offenen Vorfälle.");
          return;
        }
        const newest = incidents[0]!;
        await service.closeIncident(newest.id);
        await replyV2(ctx.interaction, `Vorfälle geschlossen (ID \`${newest.id.slice(0, 8)}\`).`);
      });

      // --- notify -----------------------------------------------------------
      commands.register(def, { name: "notify", description: "Benachrichtigung senden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const text = ctx.interaction.options.getString("text") ?? "";
        await service.logNotification(ctx.interaction.guildId!, server.id, { text, by: ctx.interaction.user.id });
        await replyV2(ctx.interaction, `🔔 Benachrichtigung geloggt: ${text}`);
      });

      // --- panel ------------------------------------------------------------
      commands.register(def, { name: "panel", description: "Status-Panel verwalten" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const aktion = ctx.interaction.options.data.find((o) => o.name === "aktion")?.value as "create" | "delete" | "refresh" | undefined;
        const channel = ctx.interaction.channel;

        if (aktion === "create") {
          if (!channel || channel.type !== ChannelType.GuildText) {
            await replyV2(ctx.interaction, "Panel kann nur in einem Textkanal erstellt werden.");
            return;
          }
          const client = await service.clientForGuild(ctx.interaction.guildId!);
          const serverInfo = client ? await client.fetchServer() : null;
          const layout: V2Layout = {
            version: 1,
            children: [
              { type: "text", style: "heading", content: `Ã°Å¸â€“Â¥Ã¯Â¸Â Server-Status: ${server.name}` },
              { type: "text", content: `Ã°Å¸Å¸Â¢ Online Ã¢â‚¬â€œ ${serverInfo?.players ?? "?"}/${serverInfo?.maxPlayers ?? "?"} Spieler` },
              { type: "separator", line: true },
              { type: "text", content: `Aktualisiert: <t:${Math.floor(Date.now() / 1000)}:R>` },
            ],
          };
          const sent = await (channel as { send(o: unknown): Promise<{ id: string }> }).send(new V2MessageBuilder(layout).build());
          await service.dbInsertStatusPanel(ctx.interaction.guildId!, channel.id, sent.id);
          await replyV2(ctx.interaction, "Status-Panel erstellt. Es wird automatisch aktualisiert.");
        } else if (aktion === "delete") {
          await service.dbDeleteStatusPanel(ctx.interaction.guildId!, channel?.id ?? "");
          await replyV2(ctx.interaction, "Status-Panel(s) für diesen Kanal gelöscht.");
        } else {
          const client = await service.clientForGuild(ctx.interaction.guildId!);
          const serverInfo = client ? await client.fetchServer() : null;
          if (serverInfo) await service.refreshPanels(server, serverInfo);
          await replyV2(ctx.interaction, "Status-Panels aktualisiert.");
        }
      });

      // --- stats ------------------------------------------------------------
      commands.register(def, { name: "stats", description: "Statistiken anzeigen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const zeitraum = ctx.interaction.options.getString("zeitraum") ?? "24h";
        const data = await service.getStats(server.id, zeitraum);
        const lines = data ? Object.entries(data).map(([k, v]) => `**${k}:** ${v}`) : [];
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Ã°Å¸â€œÅ  Statistiken (${zeitraum})` },
            textBlock(lines, "Noch keine Daten."),
          ],
        };
        await ctx.interaction.reply(replyLayout(layout));
      });

      // --- perms ------------------------------------------------------------
      commands.register(def, { name: "perms", description: "Berechtigungen anzeigen/setzen" }, async (ctx) => {
        const aktion = ctx.interaction.options.data.find((o) => o.name === "aktion")?.value as "view" | "set" | undefined;
        const rolle = ctx.interaction.options.getRole("rolle");

        if (aktion === "set" && rolle) {
          await service.setPermission(ctx.interaction.guildId!, "erlc", rolle.id);
          await replyV2(ctx.interaction, `ER:LC-Berechtigung auf Rolle <@&${rolle.id}> gesetzt.`);
        } else {
          const perm = await service.getPermission(ctx.interaction.guildId!, "erlc");
          await replyV2(ctx.interaction, perm?.allow_role
            ? `ER:LC-Befehle sind auf <@&${perm.allow_role}> beschränkt.`
            : "ER:LC-Befehle sind für alle Staff-Mitglieder freigegeben.");
        }
      });

      // --- command ----------------------------------------------------------
      commands.register(def, { name: "command", description: "Roh-Befehl an das Spiel senden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const cmd = ctx.interaction.options.getString("cmd") ?? "";
        const result = await service.execCommand(ctx.interaction.guildId!, server, ctx.interaction.user.id, cmd);
        await replyV2(ctx.interaction, result.success
          ? `✅ Befehl \`${cmd}\` ausgeführt.`
          : `❌ Befehl \`${cmd}\` fehlgeschlagen.`);
      });
    },
  };
}
