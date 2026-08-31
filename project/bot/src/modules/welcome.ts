import { Events } from "discord.js";
import { V2MessageBuilder, findCommand, type V2Layout } from "@berlin/shared";
import type { BotModule } from "../core/registry.js";
import type { SlashContext } from "../core/commandDispatcher.js";
import type { SettingsService } from "../core/settingsService.js";

/** Welcome-Modul: /welcome set/test/disable + GuildMemberAdd-Handler. */
export function welcomeModule(settingsService: SettingsService): BotModule {
  return {
    name: "welcome",
    register({ commands, eventRouter, client }) {
      const def = findCommand("welcome")!;

      commands.register(def, { name: "set", description: "Willkommens-Kanal setzen" }, async (ctx) => {
        const kanalOpt = ctx.interaction.options.getChannel("kanal");
        if (!kanalOpt) {
          await ctx.interaction.reply({ content: "Bitte einen Kanal angeben.", flags: 64 });
          return;
        }
        await settingsService.setWelcomeChannel(ctx.interaction.guildId!, kanalOpt.id);
        await ctx.interaction.reply({ content: `Willkommens-Nachrichten werden jetzt in ${kanalOpt} gesendet.`, flags: 64 });
      });

      commands.register(def, { name: "test", description: "Willkommens-Nachricht testen" }, async (ctx) => {
        const s = await settingsService.get(ctx.interaction.guildId!);
        if (!s.welcome.channelId) {
          await ctx.interaction.reply({ content: "Kein Willkommens-Kanal konfiguriert.", flags: 64 });
          return;
        }
        const channel = await ctx.interaction.guild?.channels.fetch(s.welcome.channelId).catch(() => null);
        if (!channel || !("send" in channel)) {
          await ctx.interaction.reply({ content: "Willkommens-Kanal nicht erreichbar.", flags: 64 });
          return;
        }
        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: `Willkommen, ${ctx.interaction.user.username}!` },
            { type: "text", content: `Dies ist eine Test-Willkommensnachricht. Willkommen auf Berlin Roleplay, <@${ctx.interaction.user.id}>!`, style: "paragraph" },
          ],
        };
        await (channel as { send(o: unknown): Promise<unknown> }).send(new V2MessageBuilder(layout).build());
        await ctx.interaction.reply({ content: "Test-Nachricht gesendet.", flags: 64 });
      });

      commands.register(def, { name: "disable", description: "Willkommens-System deaktivieren" }, async (ctx) => {
        await settingsService.setWelcomeEnabled(ctx.interaction.guildId!, false);
        await ctx.interaction.reply({ content: "Willkommens-System deaktiviert.", flags: 64 });
      });

      // GuildMemberAdd: Rollen + Nachricht.
      eventRouter.on(Events.GuildMemberAdd, async (member) => {
        try {
          const s = await settingsService.get(member.guild.id);
          if (!s.welcome.enabled || !s.welcome.channelId) return;

          // Rollen vergeben.
          if (s.roles.welcomeRoles.length > 0) {
            const bot = member.guild.members.me;
            const botPos = bot?.roles.highest.position ?? 0;
            const assignable = s.roles.welcomeRoles.filter((id) => {
              const r = member.guild.roles.cache.get(id);
              return r && r.position < botPos;
            });
            if (assignable.length > 0) {
              await member.roles.add(assignable).catch(() => {});
            }
          }

          // Nachricht senden.
          const channel = await member.guild.channels.fetch(s.welcome.channelId).catch(() => null);
          if (!channel || !("send" in channel)) return;

          const layout: V2Layout = {
            version: 1,
            children: [
              { type: "text", style: "heading", content: `Willkommen, ${member.user.username}!` },
              { type: "text", content: `Wir freuen uns, dass du da bist, <@${member.id}>. Viel Spaß auf Berlin Roleplay!`, style: "paragraph" },
            ],
          };
          await (channel as { send(o: unknown): Promise<unknown> }).send(new V2MessageBuilder(layout).build());
        } catch {
          // Stille Fehlerverarbeitung.
        }
      });

      void client;
    },
  };
}
