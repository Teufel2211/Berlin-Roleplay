import { findCommand, V2MessageBuilder, type V2Layout } from "@berlin/shared";
import { type BotModule } from "../core/registry.js";
import { type SlashContext } from "../core/commandDispatcher.js";
import { type GiveawayService } from "./service.js";

const GIVEAWAY_JOIN_PREFIX = "berlin:giveaway:join";

/** Giveaway-Modul: create/end/reroll/cancel + Teilnahme-Button. */
export function giveawayModule(giveaways: GiveawayService): BotModule {
  return {
    name: "giveaway",
    register({ commands, interactionRouter }) {
      const def = findCommand("giveaway")!;

      commands.register(def, { name: "create", description: "Giveaway erstellen", options: [
        { name: "kanal", description: "Kanal", type: "channel", required: true },
        { name: "preis", description: "Preis", type: "string", required: true },
        { name: "gewinner", description: "Anzahl Gewinner", type: "integer", required: true, min: 1, max: 25 },
        { name: "dauer", description: "Dauer in Stunden", type: "integer", required: true, min: 1, max: 8760 },
      ] }, async (ctx) => {
        const kanalOpt = ctx.interaction.options.getChannel("kanal", true);
        const kanal = ctx.interaction.guild?.channels.cache.get(kanalOpt.id);
        if (!kanal || !kanal.isTextBased()) {
          await ctx.interaction.reply({ content: "Der Kanal muss ein Textkanal sein.", flags: 64 });
          return;
        }
        const preis = ctx.interaction.options.getString("preis", true);
        const gewinner = ctx.interaction.options.getInteger("gewinner", true);
        const dauer = ctx.interaction.options.getInteger("dauer", true);

        const layout: V2Layout = {
          version: 1,
          children: [
            { type: "text", style: "heading", content: "🎉 Giveaway" },
            { type: "text", content: `**Preis:** ${preis}\n**Gewinner:** ${gewinner}\n**Endet:** <t:${Math.floor(Date.now() / 1000) + dauer * 3600}:R>`, style: "paragraph" },
            { type: "row", items: [{ type: "button", label: "Teilnehmen", style: "success", customId: "berlin:giveaway:join" }] },
          ],
        };

        const msg = await kanal.send(new V2MessageBuilder(layout).build());

        await giveaways.create({
          guild_id: ctx.interaction.guildId!,
          channel_id: kanal.id,
          message_id: msg.id,
          prize: preis,
          winners_count: gewinner,
          end_at: new Date(Date.now() + dauer * 3600_000).toISOString(),
          host_id: ctx.interaction.user.id,
        });

        await ctx.interaction.reply({ content: `Giveaway im Kanal ${kanal} erstellt.`, flags: 64 });
      });

      commands.register(def, { name: "end", description: "Giveaway vorzeitig beenden" }, async (ctx) => {
        await endByMessage(ctx, giveaways);
      });
      commands.register(def, { name: "reroll", description: "Gewinner neu ziehen" }, async (ctx) => {
        await endByMessage(ctx, giveaways, true);
      });
      commands.register(def, { name: "cancel", description: "Giveaway abbrechen" }, async (ctx) => {
        await cancelByMessage(ctx, giveaways);
      });

      interactionRouter.on(GIVEAWAY_JOIN_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        const ephemeral = { content: "Du hast am Giveaway teilgenommen!", flags: 64 };
        const giveawayId = ictx.data.length > 0 ? ictx.data : undefined;

        if (giveawayId) {
          await giveaways.addEntry(giveawayId, ictx.userId);
          await ictx.interaction.reply(ephemeral);
          return;
        }

        // Fallback: per Message-Referenz suchen.
        const g = await giveaways.findByMessage(ictx.guildId, ictx.interaction.message.id);
        if (!g) {
          await ictx.interaction.reply({ content: "Dieses Giveaway existiert nicht mehr.", flags: 64 });
          return;
        }
        await giveaways.addEntry(g.id, ictx.userId);
        await ictx.interaction.reply(ephemeral);
      });
    },
  };
}

async function endByMessage(ctx: SlashContext, giveaways: GiveawayService, reroll = false): Promise<void> {
  const ref = ctx.interaction.options.getString("nachricht", true);
  const messageId = extractMessageId(ref);
  if (!ctx.interaction.guildId || !messageId) {
    await ctx.interaction.reply({ content: "Ungültige Nachrichten-Referenz.", flags: 64 });
    return;
  }
  const g = await giveaways.findByMessage(ctx.interaction.guildId, messageId);
  if (!g || g.status !== "running") {
    await ctx.interaction.reply({ content: "Giveaway nicht gefunden oder nicht aktiv.", flags: 64 });
    return;
  }
  const entries = await giveaways.entries(g.id);
  const winners = giveaways.drawWinners(entries, g.winners_count);
  await giveaways.updateStatus(g.id, "ended");
  const winnerText = winners.length ? winners.map((w) => `<@${w}>`).join(" ") : "Keine Teilnehmer.";
  await ctx.interaction.reply({
    content: reroll ? `Neuziehung für **${g.prize}**: ${winnerText}` : `Gewinner für **${g.prize}**: ${winnerText}`,
    flags: 64,
  });
}

async function cancelByMessage(ctx: SlashContext, giveaways: GiveawayService): Promise<void> {
  const messageId = extractMessageId(ctx.interaction.options.getString("nachricht", true));
  if (!ctx.interaction.guildId || !messageId) {
    await ctx.interaction.reply({ content: "Ungültige Nachrichten-Referenz.", flags: 64 });
    return;
  }
  const g = await giveaways.findByMessage(ctx.interaction.guildId, messageId);
  if (!g || g.status !== "running") {
    await ctx.interaction.reply({ content: "Giveaway nicht gefunden oder nicht aktiv.", flags: 64 });
    return;
  }
  await giveaways.updateStatus(g.id, "cancelled");
  await ctx.interaction.reply({ content: `Giveaway für **${g.prize}** abgebrochen.`, flags: 64 });
}

/** Message-ID aus Link (".../123123123") oder nackter ID ziehen. */
function extractMessageId(ref: string): string {
  const last = ref.trim().split("/").pop() ?? "";
  return /^\d{15,20}$/.test(last) ? last : "";
}