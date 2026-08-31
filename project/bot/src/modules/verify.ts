import { V2MessageBuilder, findCommand, type V2Layout } from "@berlin/shared";
import type { BotModule } from "../core/registry.js";
import type { SlashContext } from "../core/commandDispatcher.js";
import type { SettingsService } from "../core/settingsService.js";
import type { InteractionContext } from "../core/interactions/router.js";
import { replyV2 } from "../core/messages.js";

const VERIFY_PREFIX = "berlin:verify:accept";

/** Verify-Modul: Panel-Setup + Button-Click vergibt verified-Rolle. */
export function verifyModule(settingsService: SettingsService): BotModule {
  return {
    name: "verify",
    register({ commands, interactionRouter }) {
      const def = findCommand("verify")!;

      commands.register(def, { name: "set", description: "Verifizierungs-Panel einrichten" }, async (ctx) => {
        const s = await settingsService.get(ctx.interaction.guildId!);
        if (!s.roles.verified) {
          await replyV2(ctx.interaction, "Keine `verified`-Rolle konfiguriert.");
          return;
        }

        const kanalOpt = ctx.interaction.options.getChannel("kanal");
        if (!kanalOpt || !("send" in kanalOpt)) {
          await replyV2(ctx.interaction, "Bitte einen gültigen Textkanal angeben.");
          return;
        }

        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: "✅ Verifizierung" },
            { type: "text", content: "Klicke auf den Button, um dich zu verifizieren und Zugang zum Server zu erhalten.", style: "paragraph" },
            {
              type: "row",
              items: [
                { type: "button", label: "Verifizieren", style: "success", customId: VERIFY_PREFIX },
              ],
            },
          ],
        };

        const msg = await (kanalOpt as unknown as { send(o: unknown): Promise<{ id: string }> }).send(
          new V2MessageBuilder(layout).build(),
        );
        await settingsService.setVerificationPanel(ctx.interaction.guildId!, {
          channelId: kanalOpt.id,
          panelMessageId: msg.id,
          method: "button",
        });
        await replyV2(ctx.interaction, `Verify-Panel in ${kanalOpt} erstellt.`);
      });

      commands.register(def, { name: "check", description: "Verifizierung eines Users prüfen" }, async (ctx) => {
        const user = ctx.interaction.options.getUser("user");
        if (!user) {
          await replyV2(ctx.interaction, "Bitte einen User angeben.");
          return;
        }
        const s = await settingsService.get(ctx.interaction.guildId!);
        if (!s.roles.verified) {
          await replyV2(ctx.interaction, "Keine verified-Rolle konfiguriert.");
          return;
        }
        const member = await ctx.interaction.guild?.members.fetch(user.id).catch(() => null);
        if (!member) {
          await replyV2(ctx.interaction, "User nicht auf diesem Server.");
          return;
        }
        const isVerified = member.roles.cache.has(s.roles.verified);
        await replyV2(ctx.interaction, `<@${user.id}> ist ${isVerified ? "✅ verifiziert" : "❌ nicht verifiziert"}.`);
      });

      commands.register(def, { name: "unverify", description: "Verifizierung entziehen" }, async (ctx) => {
        const user = ctx.interaction.options.getUser("user");
        if (!user) {
          await replyV2(ctx.interaction, "Bitte einen User angeben.");
          return;
        }
        const s = await settingsService.get(ctx.interaction.guildId!);
        if (!s.roles.verified) {
          await replyV2(ctx.interaction, "Keine verified-Rolle konfiguriert.");
          return;
        }
        const member = await ctx.interaction.guild?.members.fetch(user.id).catch(() => null);
        if (!member) {
          await replyV2(ctx.interaction, "User nicht auf diesem Server.");
          return;
        }
        await member.roles.remove(s.roles.verified).catch(() => {});
        await replyV2(ctx.interaction, `Verifizierung von <@${user.id}> entzogen.`);
      });

      commands.register(def, { name: "restore", description: "Rollen wiederherstellen" }, async (ctx) => {
        await replyV2(ctx.interaction, "Rollenwiederherstellung ist in der aktuellen Datenbank noch nicht verfügbar.");
      });

      // Button-Handler.
      interactionRouter.on(VERIFY_PREFIX, async (ictx: InteractionContext) => {
        if (!ictx.interaction.isButton()) return;
        const s = await settingsService.get(ictx.guildId);
        if (!s.verification.enabled) {
          await replyV2(ictx.interaction, "Verifizierung ist derzeit deaktiviert.");
          return;
        }
        if (!s.roles.verified) {
          await replyV2(ictx.interaction, "Keine verified-Rolle konfiguriert.");
          return;
        }

        const guild = ictx.interaction.guild;
        if (!guild) return;

        const member = await guild.members.fetch(ictx.userId).catch(() => null);
        if (!member) return;

        const bot = guild.members.me;
        const botPos = bot?.roles.highest.position ?? 0;
        const verifiedRole = guild.roles.cache.get(s.roles.verified);
        if (!verifiedRole || verifiedRole.position >= botPos) {
          await replyV2(ictx.interaction, "Die verified-Rolle ist zu hoch oder nicht vorhanden.");
          return;
        }

        if (member.roles.cache.has(s.roles.verified)) {
          await replyV2(ictx.interaction, "Du bist bereits verifiziert.");
          return;
        }

        await member.roles.add(s.roles.verified).catch(() => {});
        await replyV2(ictx.interaction, "Du wurdest verifiziert! Willkommen auf Berlin Roleplay.");
      });
    },
  };
}
