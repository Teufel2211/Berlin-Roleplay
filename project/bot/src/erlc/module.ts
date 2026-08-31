import { ChannelType } from "discord.js";
import { V2MessageBuilder, findCommand, type V2Layout } from "@berlin/shared";
import { type BotModule } from "../core/registry.js";
import { type SlashContext } from "../core/commandDispatcher.js";
import { type ErlcService } from "./service.js";

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
          await ctx.interaction.reply({
            content: "Kein ER:LC-Server fÃƒÂ¼r diese Guild konfiguriert (Server muss in der DB hinterlegt sein).",
            flags: 64,
          });
          return null;
        }
        return server;
      };

      const getClient = async (ctx: SlashContext): Promise<Awaited<ReturnType<ErlcService["clientForGuild"]>>> => {
        const client = await service.clientForGuild(ctx.interaction.guildId!);
        if (!client) {
          await ctx.interaction.reply({
            content: "Kein ER:LC-Server fÃƒÂ¼r diese Guild konfiguriert.",
            flags: 64,
          });
        }
        return client;
      };

      const textBlock = (lines: string[], empty: string): { type: "text"; content: string; style: "paragraph" } => ({
        type: "text",
        content: lines.length ? lines.join("\n") : empty,
        style: "paragraph",
      });

      /** V2-Layout in einen fÃƒÂ¼r interaction.reply gÃƒÂ¼ltigen Payload umbauen (flags aus MessageCreateOptions entfernen). */
      const replyLayout = (layout: V2Layout) => {
        const p = new V2MessageBuilder(layout).build();
        return { content: p.content ?? "", components: p.components };
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
        await ctx.interaction.reply({ content: "Server-Join erfolgt ÃƒÂ¼ber die ER:LC-Client (in der jeweiligen Guild-Konfiguration).", flags: 64 });
      });
      commands.register(def, { name: "leave", description: "Server verlassen" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        await ctx.interaction.reply({ content: "Server-Leave erfolgt ÃƒÂ¼ber die ER:LC-Client (in der jeweiligen Guild-Konfiguration).", flags: 64 });
      });

      // --- duty -------------------------------------------------------------
      commands.register(def, { name: "duty", description: "Dienst beginnen/beenden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const aktion = ctx.interaction.options.data.find((o) => o.name === "aktion")?.value as "start" | "end" | undefined;
        const duty = aktion === "start";
        await service.setDuty(ctx.interaction.guildId!, ctx.interaction.user.id, server, ctx.interaction.user.id, duty);
        await ctx.interaction.reply({
          content: duty
            ? `Ã¢Å“â€¦ Dienst begonnen (${new Date().toLocaleTimeString("de-DE")}).`
            : "Ã¢ÂÂ¹Ã¯Â¸Â Dienst beendet.",
          flags: 64,
        });
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
        await ctx.interaction.reply({
          content: `Ã°Å¸Å¡Â¨ Vorfall erstellt (ID \`${incident.id.slice(0, 8)}\`).`,
          flags: 64,
        });
      });

      commands.register(def, { name: "incident-close", description: "Vorfall schlieÃƒÅ¸en" }, async (ctx) => {
        const incidents = await service.openIncidents(ctx.interaction.guildId!);
        if (incidents.length === 0) {
          await ctx.interaction.reply({ content: "Keine offenen VorfÃƒÂ¤lle.", flags: 64 });
          return;
        }
        const newest = incidents[0]!;
        await service.closeIncident(newest.id);
        await ctx.interaction.reply({ content: `VorfÃƒÂ¤lle geschlossen (ID \`${newest.id.slice(0, 8)}\`).`, flags: 64 });
      });

      // --- notify -----------------------------------------------------------
      commands.register(def, { name: "notify", description: "Benachrichtigung senden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const text = ctx.interaction.options.getString("text") ?? "";
        await service.logNotification(ctx.interaction.guildId!, server.id, { text, by: ctx.interaction.user.id });
        await ctx.interaction.reply({ content: `Ã°Å¸â€â€ Benachrichtigung geloggt: ${text}`, flags: 64 });
      });

      // --- panel ------------------------------------------------------------
      commands.register(def, { name: "panel", description: "Status-Panel verwalten" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const aktion = ctx.interaction.options.data.find((o) => o.name === "aktion")?.value as "create" | "delete" | "refresh" | undefined;
        const channel = ctx.interaction.channel;

        if (aktion === "create") {
          if (!channel || channel.type !== ChannelType.GuildText) {
            await ctx.interaction.reply({ content: "Panel kann nur in einem Textkanal erstellt werden.", flags: 64 });
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
          await ctx.interaction.reply({ content: "Status-Panel erstellt. Es wird automatisch aktualisiert.", flags: 64 });
        } else if (aktion === "delete") {
          await service.dbDeleteStatusPanel(ctx.interaction.guildId!, channel?.id ?? "");
          await ctx.interaction.reply({ content: "Status-Panel(s) fÃƒÂ¼r diesen Kanal gelÃƒÂ¶scht.", flags: 64 });
        } else {
          const client = await service.clientForGuild(ctx.interaction.guildId!);
          const serverInfo = client ? await client.fetchServer() : null;
          if (serverInfo) await service.refreshPanels(server, serverInfo);
          await ctx.interaction.reply({ content: "Status-Panels aktualisiert.", flags: 64 });
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
          await ctx.interaction.reply({ content: `ER:LC-Berechtigung auf Rolle <@&${rolle.id}> gesetzt.`, flags: 64 });
        } else {
          const perm = await service.getPermission(ctx.interaction.guildId!, "erlc");
          await ctx.interaction.reply({
            content: perm?.allow_role
              ? `ER:LC-Befehle sind auf <@&${perm.allow_role}> beschrÃƒÂ¤nkt.`
              : "ER:LC-Befehle sind fÃƒÂ¼r alle Staff-Mitglieder freigegeben.",
            flags: 64,
          });
        }
      });

      // --- command ----------------------------------------------------------
      commands.register(def, { name: "command", description: "Roh-Befehl an das Spiel senden" }, async (ctx) => {
        const server = await requireServer(ctx);
        if (!server) return;
        const cmd = ctx.interaction.options.getString("cmd") ?? "";
        const result = await service.execCommand(ctx.interaction.guildId!, server, ctx.interaction.user.id, cmd);
        await ctx.interaction.reply({
          content: result.success
            ? `Ã¢Å“â€¦ Befehl \`${cmd}\` ausgefÃƒÂ¼hrt.`
            : `Ã¢ÂÅ’ Befehl \`${cmd}\` fehlgeschlagen.`,
          flags: 64,
        });
      });
    },
  };
}
