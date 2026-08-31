import { type SupabaseClient } from "@supabase/supabase-js";
import { TABLES, withRetry } from "../core/db.js";

export interface Ticket {
  id: string;
  guild_id: string;
  panel_id: string | null;
  channel_id: string;
  user_id: string;
  claimer_id: string | null;
  status: "open" | "claimed" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface TicketPanel {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  selection_type: "button" | "select";
  config: Record<string, unknown>;
}

interface PanelInput {
  guild_id: string;
  channel_id: string;
  message_id?: string;
  title: string;
  description?: string;
  selection_type?: "button" | "select";
  config?: Record<string, unknown>;
}

export interface CreatedPanel extends TicketPanel {}

/** Ticket-System: Panels, Tickets, Sperren pro User. */
export class TicketService {
  constructor(private readonly db: SupabaseClient) {}

  async createPanel(input: PanelInput): Promise<TicketPanel> {
    const { data, error } = await withRetry(() =>
      this.db
        .from(TABLES.ticketPanels)
        .insert({
          guild_id: input.guild_id,
          channel_id: input.channel_id,
          message_id: input.message_id ?? null,
          title: input.title,
          description: input.description ?? "",
          selection_type: input.selection_type ?? "button",
          config: input.config ?? {},
        })
        .select()
        .single(),
    );
    if (error || !data) throw new Error(`Panel erstellen fehlgeschlagen: ${error?.message}`);
    return data as TicketPanel;
  }

  async panelByChannel(guildId: string, channelId: string): Promise<TicketPanel | null> {
    const { data, error } = await withRetry(() =>
      this.db.from(TABLES.ticketPanels).select().eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle(),
    );
    if (error) throw new Error(`Panel suchen fehlgeschlagen: ${error?.message}`);
    return (data as TicketPanel) ?? null;
  }

  async openTicketsByUser(guildId: string, userId: string): Promise<Ticket[]> {
    const { data, error } = await withRetry(() =>
      this.db
        .from(TABLES.tickets)
        .select()
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .in("status", ["open", "claimed"]),
    );
    if (error) throw new Error(`Offene Tickets laden fehlgeschlagen: ${error?.message}`);
    return (data ?? []) as Ticket[];
  }

  async createTicket(input: { guild_id: string; panel_id: string | null; channel_id: string; user_id: string }): Promise<Ticket> {
    const { data, error } = await withRetry(() =>
      this.db.from(TABLES.tickets).insert(input).select().single(),
    );
    if (error || !data) throw new Error(`Ticket erstellen fehlgeschlagen: ${error?.message}`);
    return data as Ticket;
  }

  async ticketByChannel(channelId: string): Promise<Ticket | null> {
    const { data, error } = await withRetry(() =>
      this.db.from(TABLES.tickets).select().eq("channel_id", channelId).maybeSingle(),
    );
    if (error) throw new Error(`Ticket suchen fehlgeschlagen: ${error?.message}`);
    return (data as Ticket) ?? null;
  }

  async updateStatus(id: string, status: Ticket["status"]): Promise<void> {
    const { error } = await withRetry(() =>
      this.db
        .from(TABLES.tickets)
        .update({ status, ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}) })
        .eq("id", id),
    );
    if (error) throw new Error(`Ticket-Status update fehlgeschlagen: ${error?.message}`);
  }

  async claim(id: string, claimerId: string): Promise<void> {
    const { error } = await withRetry(() =>
      this.db.from(TABLES.tickets).update({ claimer_id: claimerId, status: "claimed" }).eq("id", id),
    );
    if (error) throw new Error(`Ticket übernehmen fehlgeschlagen: ${error?.message}`);
  }

  async addMessage(ticketId: string, authorId: string, content: string): Promise<void> {
    const { error } = await withRetry(() =>
      this.db.from(TABLES.ticketMessages).insert({ ticket_id: ticketId, author_id: authorId, content }),
    );
    if (error) throw new Error(`Ticket-Nachricht speichern fehlgeschlagen: ${error?.message}`);
  }
}