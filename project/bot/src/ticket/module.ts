import { ChannelType, PermissionFlagsBits } from "discord.js";
import { V2MessageBuilder, findCommand, type V2Layout } from "@berlin/shared";
import type { BotModule } from "../core/registry.js";
import type { SlashContext } from "../core/commandDispatcher.js";
import type { SettingsService } from "../core/settingsService.js";
import { type InteractionContext } from "../core/interactions/router.js";
import { type Ticket, type TicketService } from "./service.js";

const OPEN_PREFIX = "berlin:ticket:open";
const CLOSE_PREFIX = "berlin:ticket:close";
const CLAIM_PREFIX = "berlin:ticket:claim";
const UNCLAIM_PREFIX = "berlin:ticket:unclaim";
const REOPEN_PREFIX = "berlin:ticket:reopen";

/** Ticket-Modul: Panel-Setup, Eröffnung per Button, Close/Claim/Reopen/Delete. */
export function ticketModule(tickets: TicketService, settingsService: SettingsService): BotModule {
  return {
    name: "ticket",
    register({ commands, interactionRouter }) {
      const def = findCommand("ticket")!;

      commands.register(def, { name: "setup", description: "Ticket-Panel im aktuellen Kanal einrichten" }, async (ctx) => {
        const channel = ctx.interaction.channel;
        if (!channel || !channel.isTextBased()) {
          await ctx.interaction.reply({ content: "Der Befehl muss in einem Textkanal ausgeführt werden.", flags: 64 });
          return;
        }
        const settings = await settingsService.get(ctx.interaction.guildId!);
        await setupPanel(ctx, tickets, settingsService, channel.id);
      });

      // Öffnen: Button auf Panel-Nachricht.
      interactionRouter.on(OPEN_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        await openTicket(ictx, tickets, settingsService);
      });
      interactionRouter.on(CLOSE_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        await staffAction(ictx, tickets, "close");
      });
      interactionRouter.on(REOPEN_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        await staffAction(ictx, tickets, "reopen");
      });
      interactionRouter.on(CLAIM_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        await staffAction(ictx, tickets, "claim");
      });
      interactionRouter.on(UNCLAIM_PREFIX, async (ictx) => {
        if (!ictx.interaction.isButton()) return;
        await staffAction(ictx, tickets, "unclaim");
      });

      commands.register(def, { name: "close", description: "Aktuelles Ticket schließen" }, async (ctx) => {
        await closeFromCommand(ctx, tickets);
      });
      commands.register(def, { name: "claim", description: "Ticket übernehmen" }, async (ctx) => {
        const ticket = await findTicketInChannel(ctx, tickets);
        if (!ticket) return;
        await tickets.claim(ticket.id, ctx.interaction.user.id);
        await renameChannel(ctx, ticket.channel_id, `ticket-${ticket.user_id.slice(-4)}`);
        await ctx.interaction.reply({ content: `Ticket übernommen von <@${ctx.interaction.user.id}>.`, flags: 64 });
      });

      void def;
    },
  };
}

async function setupPanel(
  ctx: SlashContext,
  tickets: TicketService,
  settingsService: SettingsService,
  channelId: string,
): Promise<void> {
  const s = await settingsService.get(ctx.interaction.guildId!);
  if (!s.ticket.categoryId) {
    await ctx.interaction.reply({
      content: "Bitte zuerst eine Ticket-Kategorie im Dashboard/`/admin` konfigurieren.",
      flags: 64,
    });
    return;
  }

  const layout: V2Layout = {
    version: 1,
    children: [
      { type: "text", style: "heading", content: "🎫 Ticket-Support" },
      { type: "text", content: "Eröffne ein Ticket, um Unterstützung vom Team zu erhalten.", style: "paragraph" },
      {
        type: "row",
        items: [
          { type: "button", label: "Ticket öffnen", style: "primary", customId: OPEN_PREFIX },
        ],
      },
    ],
  };

  const payload = new V2MessageBuilder(layout).build();
  const channel = await ctx.interaction.guild!.channels.fetch(channelId);
  if (!channel || !("send" in channel)) {
    await ctx.interaction.reply({ content: "Panel-Kanal nicht erreichbar.", flags: 64 });
    return;
  }
  const msg = await (channel as { send(o: unknown): Promise<{ id: string }> }).send(payload);
  await tickets.createPanel({
    guild_id: ctx.interaction.guildId!,
    channel_id: channelId,
    message_id: msg.id,
    title: "Ticket-Support",
    description: "Eröffne ein Ticket, um Unterstützung vom Team zu erhalten.",
    selection_type: "button",
  });
  await ctx.interaction.reply({ content: `Ticket-Panel in <#${channelId}> erstellt.`, flags: 64 });
}

async function openTicket(
  ictx: InteractionContext,
  tickets: TicketService,
  settingsService: SettingsService,
): Promise<void> {
  if (!ictx.interaction.isButton()) return;
  const guild = ictx.interaction.guild;
  if (!guild) return;
  const s = await settingsService.get(ictx.guildId);

  if (!s.ticket.categoryId) {
    await ictx.interaction.reply({ content: "Keine Ticket-Kategorie konfiguriert.", flags: 64 });
    return;
  }
  const open = await tickets.openTicketsByUser(ictx.guildId, ictx.userId);
  if (open.length >= s.ticket.maxOpenPerUser) {
    await ictx.interaction.reply({ content: `Maximal ${s.ticket.maxOpenPerUser} offene Tickets erlaubt.`, flags: 64 });
    return;
  }

  const channelName = `ticket-${ictx.userId.slice(-4)}-${open.length + 1}`;
  const ticketRole = s.roles.ticketTeam;
  const overwrites = [
    { id: guild.id, deny: [BigInt(PermissionFlagsBits.ViewChannel)] },
    { id: ictx.userId, allow: [BigInt(PermissionFlagsBits.ViewChannel), BigInt(PermissionFlagsBits.SendMessages)] },
    ...(ticketRole ? [{ id: ticketRole, allow: [BigInt(PermissionFlagsBits.ViewChannel), BigInt(PermissionFlagsBits.SendMessages)] }] : []),
  ];
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: s.ticket.categoryId,
    permissionOverwrites: overwrites as Parameters<typeof guild.channels.create>[0]["permissionOverwrites"],
  });
  if (!channel.isTextBased()) return;

  await tickets.createTicket({
    guild_id: ictx.guildId,
    panel_id: null,
    channel_id: channel.id,
    user_id: ictx.userId,
  });

  const layout: V2Layout = {
    version: 1,
    children: [
      { type: "text", style: "heading", content: "🎫 Neues Ticket" },
      { type: "text", content: `Erstellt von <@${ictx.userId}>.\nSchließen: Button unten.`, style: "paragraph" },
      { type: "row", items: [
        { type: "button", label: "Schließen", style: "danger", customId: CLOSE_PREFIX },
      ] },
    ],
  };
  void channel.send(new V2MessageBuilder(layout).build());

  await ictx.interaction.reply({ content: `Dein Ticket wurde erstellt: ${channel}`, flags: 64 });
}

type StaffAction = "close" | "reopen" | "claim" | "unclaim";

async function staffAction(
  ictx: InteractionContext,
  tickets: TicketService,
  action: StaffAction,
): Promise<void> {
  if (!ictx.interaction.isButton()) return;
  const ticket = await tickets.ticketByChannel(ictx.interaction.channelId ?? ictx.guildId);
  if (!ticket) {
    await ictx.interaction.reply({ content: "Kein Ticket in diesem Kanal.", flags: 64 });
    return;
  }
  switch (action) {
    case "claim":
      await tickets.claim(ticket.id, ictx.userId);
      await ictx.interaction.reply({ content: `Ticket übernommen von <@${ictx.userId}>.`, flags: 64 });
      break;
    case "unclaim":
      await tickets.updateStatus(ticket.id, "open");
      await ictx.interaction.reply({ content: "Ticket wieder freigegeben.", flags: 64 });
      break;
    case "close":
      await tickets.updateStatus(ticket.id, "closed");
      await ictx.interaction.reply({ content: `Ticket geschlossen.`, flags: 64 });
      break;
    case "reopen":
      await tickets.updateStatus(ticket.id, "open");
      await ictx.interaction.reply({ content: "Ticket wieder geöffnet.", flags: 64 });
      break;
  }
}

async function closeFromCommand(ctx: SlashContext, tickets: TicketService): Promise<void> {
  const channel = ctx.interaction.channel;
  if (!channel) return;
  const ticket = await tickets.ticketByChannel(channel.id);
  if (!ticket) {
    await ctx.interaction.reply({ content: "Kein Ticket in diesem Kanal.", flags: 64 });
    return;
  }
  await tickets.updateStatus(ticket.id, "closed");
  await ctx.interaction.reply({ content: "Ticket geschlossen.", flags: 64 });
}

async function findTicketInChannel(ctx: SlashContext, tickets: TicketService): Promise<Ticket | null> {
  const channel = ctx.interaction.channel;
  if (!channel) return null;
  const ticket = await tickets.ticketByChannel(channel.id);
  if (!ticket) {
    await ctx.interaction.reply({ content: "Kein Ticket in diesem Kanal.", flags: 64 });
    return null;
  }
  return ticket;
}

async function renameChannel(ctx: SlashContext, channelId: string, name: string): Promise<void> {
  const channel = await ctx.interaction.guild?.channels.fetch(channelId).catch(() => null);
  if (channel && "setName" in channel) {
    await (channel as { setName(n: string): Promise<unknown> }).setName(name).catch(() => {});
  }
}