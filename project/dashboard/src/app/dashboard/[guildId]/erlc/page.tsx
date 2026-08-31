import { requireGuild } from "@/lib/guild";
import { listERLCServers } from "@/lib/queries";
import { ModuleHeader, Badge, Panel, EmptyState, formatDate } from "@/components/ui";
import { ERLCRegisterForm, ERLCServerActions } from "@/components/module-forms";

export default async function ERLCPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const servers = await listERLCServers(guildId);
  const enabled = servers.filter((s) => s.enabled).length;

  return (
    <div>
      <ModuleHeader
        title={`ER:LC · ${guild.guildName}`}
        description="Emergency Response: Liberty County – Server-Anbindung."
      />

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Panel>
          <p className="text-sm text-[--text-muted]">Verbundene Server</p>
          <p className="text-3xl font-bold mt-1">{servers.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-[--text-muted]">Aktiv</p>
          <p className="text-3xl font-bold mt-1">{enabled}</p>
        </Panel>
      </div>

      {guild.role === "admin" ? (
        <div className="mb-8 max-w-xl">
          <ERLCRegisterForm guildId={guildId} />
        </div>
      ) : null}

      {servers.length === 0 ? (
        <EmptyState message="Noch keine ER:LC-Server verbunden." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s) => (
            <Panel key={s.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{s.name}</h3>
                <Badge tone={s.enabled ? "green" : "red"}>
                  {s.enabled ? "Aktiv" : "Deaktiviert"}
                </Badge>
              </div>
              <p className="mt-3 text-xs font-mono text-[--text-muted] break-all">{s.base_url}</p>
              <p className="mt-2 text-xs text-[--text-muted]">
                Aktualisiert am {formatDate(s.updated_at)}
              </p>
              {guild.role === "admin" ? <ERLCServerActions guildId={guildId} server={s} /> : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
