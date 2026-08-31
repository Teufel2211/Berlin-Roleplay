import { requireGuild } from "@/lib/guild";
import { getVerificationConfig, countVerificationLogs } from "@/lib/queries";
import { ModuleHeader, Badge, Panel, EmptyState, formatDate } from "@/components/ui";
import { VerifyForm } from "@/components/module-forms";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const [config, logCount] = await Promise.all([
    getVerificationConfig(guildId),
    countVerificationLogs(guildId),
  ]);

  return (
    <div>
      <ModuleHeader
        title={`Verify · ${guild.guildName}`}
        description="Verifizierung von Mitgliedern."
      />

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Panel>
          <p className="text-sm text-[--text-muted]">Durchgeführte Verifizierungen</p>
          <p className="text-3xl font-bold mt-1">{logCount}</p>
        </Panel>
      </div>

      {guild.role === "admin" ? (
        <div className="mb-8 max-w-xl">
          <VerifyForm guildId={guildId} config={config} />
        </div>
      ) : null}

      {!config ? (
        <EmptyState message="Noch keine Verify-Konfiguration angelegt." />
      ) : (
        <Panel title="Konfiguration">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Modul</dt>
              <dd>
                <Badge tone={config.enabled ? "green" : "red"}>
                  {config.enabled ? "Aktiviert" : "Deaktiviert"}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Methode</dt>
              <dd className="font-medium capitalize">{config.method}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Kanal</dt>
              <dd className="font-mono text-xs">{config.channel_id ?? "–"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Rolle</dt>
              <dd className="font-mono text-xs">{config.role_id ?? "–"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Wiederherstellung bei Unverify</dt>
              <dd>{config.restore_on_unverify ? "Ja" : "Nein"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Zuletzt aktualisiert</dt>
              <dd>{formatDate(config.updated_at)}</dd>
            </div>
          </dl>
        </Panel>
      )}
    </div>
  );
}
