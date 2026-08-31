import { requireGuild, getGuildStats } from "@/lib/guild";
import {
  countVerificationLogs,
  listERLCServers,
  listGiveaways,
  listTickets,
} from "@/lib/queries";
import { ModuleHeader, Panel } from "@/components/ui";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);

  const [base, tickets, giveaways, serverCount, verifyCount] = await Promise.all([
    getGuildStats(guild),
    listTickets(guildId),
    listGiveaways(guildId),
    listERLCServers(guildId),
    countVerificationLogs(guildId),
  ]);

  const totalTickets = tickets.length;
  const closedTickets = tickets.filter((t) => t.status === "closed").length;
  const openTickets = tickets.filter((t) => t.status !== "closed").length;
  const totalEntries = giveaways.reduce((s, g) => s + (g.entries ?? 0), 0);

  const blocks = [
    { label: "Tickets gesamt", value: totalTickets },
    { label: "Tickets offen", value: openTickets },
    { label: "Tickets geschlossen", value: closedTickets },
    { label: "Giveaways", value: giveaways.length },
    { label: "Giveaway-Teilnahmen", value: totalEntries },
    { label: "Verifizierungen", value: verifyCount },
    { label: "ER:LC-Server", value: serverCount.length },
    { label: "Audit-Einträge", value: base.auditCount },
  ];

  return (
    <div>
      <ModuleHeader
        title={`Statistiken · ${guild.guildName}`}
        description="Kennzahlen aller Module auf einen Blick."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {blocks.map((b) => (
          <Panel key={b.label}>
            <p className="text-sm text-[--text-muted]">{b.label}</p>
            <p className="text-3xl font-bold mt-1">{b.value}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
