import { requireGuild } from "@/lib/guild";
import { listTickets } from "@/lib/queries";
import { ModuleHeader, Badge, EmptyState, Panel, formatDate } from "@/components/ui";
import { TicketActions } from "@/components/module-forms";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const tickets = await listTickets(guildId);

  const open = tickets.filter((t) => t.status === "open");
  const claimed = tickets.filter((t) => t.status === "claimed");
  const closed = tickets.filter((t) => t.status === "closed");

  const statusTone: Record<string, "green" | "orange" | "red"> = {
    open: "green",
    claimed: "orange",
    closed: "red",
  };
  const statusLabel: Record<string, string> = {
    open: "Offen",
    claimed: "Claimed",
    closed: "Geschlossen",
  };

  return (
    <div>
      <ModuleHeader
        title={`Tickets · ${guild.guildName}`}
        description="Alle erstellten Tickets im Überblick."
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {[
          { label: "Offen", value: open.length, tone: "green" },
          { label: "Claimed", value: claimed.length, tone: "orange" },
          { label: "Geschlossen", value: closed.length, tone: "red" },
        ].map((c) => (
          <Panel key={c.label}>
            <p className="text-sm text-[--text-muted]">{c.label}</p>
            <p className="text-3xl font-bold mt-1">{c.value}</p>
          </Panel>
        ))}
      </div>

      {tickets.length === 0 ? (
        <EmptyState message="Noch keine Tickets vorhanden." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[--border] bg-[--bg-secondary]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[--text-muted] border-b border-[--border]">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Nutzer</th>
                <th className="px-4 py-3 font-medium">Kanal</th>
                <th className="px-4 py-3 font-medium">Claimer</th>
                <th className="px-4 py-3 font-medium">Erstellt</th>
                {guild.role === "admin" ? (
                  <th className="px-4 py-3 font-medium">Aktionen</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-[--border]/50 last:border-0">
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">{t.user_id}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{t.channel_id}</span>
                  </td>
                  <td className="px-4 py-3">{t.claimer_id ?? "–"}</td>
                  <td className="px-4 py-3">{formatDate(t.created_at)}</td>
                  {guild.role === "admin" ? (
                    <td className="px-4 py-3">
                      <TicketActions guildId={guildId} ticket={t} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
