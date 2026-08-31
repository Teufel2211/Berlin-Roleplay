import { requireGuild } from "@/lib/guild";
import { getWelcomeConfig } from "@/lib/queries";
import { ModuleHeader, Badge, Panel, EmptyState, formatDate } from "@/components/ui";
import { WelcomeForm } from "@/components/module-forms";

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const config = await getWelcomeConfig(guildId);

  return (
    <div>
      <ModuleHeader
        title={`Welcome · ${guild.guildName}`}
        description="Begrüßungs-Nachricht bei neuen Mitgliedern."
      />

      {guild.role === "admin" ? (
        <div className="mb-8 max-w-xl">
          <WelcomeForm guildId={guildId} config={config} />
        </div>
      ) : null}

      {!config ? (
        <EmptyState message="Noch keine Welcome-Konfiguration angelegt." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Status">
            <p className="text-sm text-[--text-muted]">Modul</p>
            <div className="mt-1">
              <Badge tone={config.enabled ? "green" : "red"}>
                {config.enabled ? "Aktiviert" : "Deaktiviert"}
              </Badge>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Kanal" value={config.channel_id ? `#${config.channel_id}` : "–"} mono />
              <Row label="Rolle" value={config.role_id ? `@${config.role_id}` : "–"} mono />
              <Row
                label="Komponenten-Template"
                value={config.component_template_id ?? "–"}
                mono
              />
              <Row label="Zuletzt aktualisiert" value={formatDate(config.updated_at)} />
            </dl>
          </Panel>

          <Panel title="Nachrichten-Text">
            {config.message_template ? (
              <p className="whitespace-pre-wrap text-sm text-[--text-muted]">
                {config.message_template}
              </p>
            ) : (
              <p className="text-sm text-[--text-muted]">Kein Text hinterlegt.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[--text-muted]">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-right" : "text-right font-medium"}>
        {value}
      </dd>
    </div>
  );
}
