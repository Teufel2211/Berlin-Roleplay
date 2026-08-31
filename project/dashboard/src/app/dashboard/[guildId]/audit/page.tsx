import { requireGuild } from "@/lib/guild";
import { listAuditLogs } from "@/lib/queries";
import { ModuleHeader, Badge, EmptyState, formatDate, formatRelative } from "@/components/ui";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const logs = await listAuditLogs(guildId, 50);

  return (
    <div>
      <ModuleHeader
        title={`Audit-Log · ${guild.guildName}`}
        description="Die letzten Staff-Aktionen im Überblick."
      />

      {logs.length === 0 ? (
        <EmptyState message="Noch keine Audit-Einträge vorhanden." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[--border] bg-[--bg-secondary]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[--text-muted] border-b border-[--border]">
                <th className="px-4 py-3 font-medium">Aktion</th>
                <th className="px-4 py-3 font-medium">Ausführender</th>
                <th className="px-4 py-3 font-medium">Ziel</th>
                <th className="px-4 py-3 font-medium">Wann</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[--border]/50 last:border-0">
                  <td className="px-4 py-3">
                    <Badge tone="blue">{l.action}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.actor_id}</td>
                  <td className="px-4 py-3">
                    {l.target_id ? (
                      <span className="font-mono text-xs">{l.target_id}</span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span title={formatDate(l.created_at)}>{formatRelative(l.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
