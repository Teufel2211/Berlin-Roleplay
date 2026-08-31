import { requireGuild } from "@/lib/guild";
import { listGiveaways } from "@/lib/queries";
import { ModuleHeader, Badge, EmptyState, Panel, formatDate, formatRelative } from "@/components/ui";
import { GiveawayCreateForm, GiveawayActions } from "@/components/module-forms";

export default async function GiveawaysPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const giveaways = await listGiveaways(guildId);

  const running = giveaways.filter((g) => g.status === "running");
  const ended = giveaways.filter((g) => g.status === "ended");
  const cancelled = giveaways.filter((g) => g.status === "cancelled");

  const tone: Record<string, "green" | "red" | "neutral"> = {
    running: "green",
    ended: "red",
    cancelled: "neutral",
  };
  const label: Record<string, string> = {
    running: "Läuft",
    ended: "Beendet",
    cancelled: "Abgebrochen",
  };

  return (
    <div>
      <ModuleHeader
        title={`Giveaways · ${guild.guildName}`}
        description="Laufende und beendete Giveaways."
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Panel><p className="text-sm text-[--text-muted]">Läuft</p><p className="text-3xl font-bold mt-1">{running.length}</p></Panel>
        <Panel><p className="text-sm text-[--text-muted]">Beendet</p><p className="text-3xl font-bold mt-1">{ended.length}</p></Panel>
        <Panel><p className="text-sm text-[--text-muted]">Gewinner gesamt</p><p className="text-3xl font-bold mt-1">{giveaways.reduce((s, g) => s + g.winners_count, 0)}</p></Panel>
      </div>

      {guild.role === "admin" ? (
        <div className="mb-8 max-w-xl">
          <GiveawayCreateForm guildId={guildId} />
        </div>
      ) : null}

      {giveaways.length === 0 ? (
        <EmptyState message="Noch keine Giveaways vorhanden." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[--border] bg-[--bg-secondary]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[--text-muted] border-b border-[--border]">
                <th className="px-4 py-3 font-medium">Preis</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Gewinner</th>
                <th className="px-4 py-3 font-medium">Teilnehmer</th>
                <th className="px-4 py-3 font-medium">Endet</th>
                {guild.role === "admin" ? (
                  <th className="px-4 py-3 font-medium">Aktionen</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {giveaways.map((g) => (
                <tr key={g.id} className="border-b border-[--border]/50 last:border-0">
                  <td className="px-4 py-3 font-medium">{g.prize}</td>
                  <td className="px-4 py-3"><Badge tone={tone[g.status]}>{label[g.status]}</Badge></td>
                  <td className="px-4 py-3">{g.winners_count}</td>
                  <td className="px-4 py-3">{g.entries ?? 0}</td>
                  <td className="px-4 py-3">
                    {g.status === "running" ? formatRelative(g.end_at) : formatDate(g.end_at)}
                  </td>
                  {guild.role === "admin" ? (
                    <td className="px-4 py-3">
                      <GiveawayActions guildId={guildId} giveaway={g} />
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
