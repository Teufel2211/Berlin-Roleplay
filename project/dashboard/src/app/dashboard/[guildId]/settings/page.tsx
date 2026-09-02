import { requireGuild } from "@/lib/guild";
import { getGuildSettingsRow } from "@/lib/queries";
import { ModuleHeader, Badge, Panel, EmptyState } from "@/components/ui";
import { SettingsForm } from "@/components/module-forms";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const row = await getGuildSettingsRow(guildId);

  if (!row) {
    return (
      <div>
        <ModuleHeader
          title={`Settings · ${guild.guildName}`}
          description="Globale Guild-Einstellungen verwalten."
        />
        <EmptyState message="Guild-Einstellungen konnten nicht geladen werden." />
      </div>
    );
  }

  const s = row.settings;

  return (
    <div>
      <ModuleHeader
        title={`Settings · ${guild.guildName}`}
        description="Globale Guild-Einstellungen (JSONB)."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Panel title="Rollen">
          <dl className="space-y-2 text-sm">
            <SettingRow label="Staff" value={s.roles.staff} />
            <SettingRow label="Admin" value={s.roles.admin} />
            <SettingRow label="Verifiziert" value={s.roles.verified} />
            <SettingRow label="Ticket-Team" value={s.roles.ticketTeam} />
            <SettingRow label="Giveaway-berechtigt" value={s.roles.giveawayEligible} />
            <SettingRow label="Warteraum" value={s.roles.warteraum} />
            <SettingRow label="Willkommensrollen" value={s.roles.welcomeRoles.length > 0 ? `${s.roles.welcomeRoles.length} konfiguriert` : "Keine"} />
          </dl>
        </Panel>

        <Panel title="Tickets">
          <dl className="space-y-2 text-sm">
            <SettingRow label="Kategorie" value={s.ticket.categoryId} />
            <SettingRow label="Staff-Kanal" value={s.ticket.staffChannelId} />
            <SettingRow label="Transcript-Kanal" value={s.ticket.transcriptChannelId} />
            <SettingRow label="Auto-Close" value={`${s.ticket.autoCloseHours}h`} />
            <SettingRow label="Max pro User" value={s.ticket.maxOpenPerUser} />
          </dl>
        </Panel>

        <Panel title="Giveaways">
          <dl className="space-y-2 text-sm">
            <SettingRow label="Standarddauer" value={`${s.giveaway.defaultDurationHours}h`} />
            <SettingRow label="Rollenpflicht" value={s.giveaway.requireRole ? "Ja" : "Nein"} />
          </dl>
        </Panel>

        <Panel title="Welcome">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Modul</dt>
              <dd>
                <Badge tone={s.welcome.enabled ? "green" : "red"}>
                  {s.welcome.enabled ? "Aktiviert" : "Deaktiviert"}
                </Badge>
              </dd>
            </div>
            <SettingRow label="Kanal" value={s.welcome.channelId} />
            <SettingRow label="Template" value={s.welcome.messageTemplate || "Leer"} />
          </dl>
        </Panel>

        <Panel title="Verify">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[--text-muted]">Modul</dt>
              <dd>
                <Badge tone={s.verification.enabled ? "green" : "red"}>
                  {s.verification.enabled ? "Aktiviert" : "Deaktiviert"}
                </Badge>
              </dd>
            </div>
            <SettingRow label="Kanal" value={s.verification.channelId} />
            <SettingRow label="Methode" value={s.verification.method} />
            <SettingRow label="Panel-MSG" value={s.verification.panelMessageId} />
          </dl>
        </Panel>

        <Panel title="ER:LC">
          <dl className="space-y-2 text-sm">
            <SettingRow label="Server-ID" value={s.erlc.serverId} />
            <SettingRow label="Poll-Interval" value={`${s.erlc.pollIntervalSeconds}s`} />
            <SettingRow label="Status-Kanal" value={s.erlc.statusChannelId} />
            <SettingRow label="Notify-Rolle" value={s.erlc.notifyRoleId} />
            <SettingRow label="Mock-Modus" value={s.erlc.useMock ? "Ja" : "Nein"} />
          </dl>
        </Panel>
      </div>

      <Panel title="Audit">
        <dl className="space-y-2 text-sm">
          <SettingRow label="Audit-Kanal" value={s.audit.channelId} />
          <SettingRow label="User-Aktionen" value={s.audit.includeUserActions ? "Ja" : "Nein"} />
        </dl>
      </Panel>

      {guild.role === "admin" ? (
        <div className="mt-8 max-w-3xl">
          <SettingsForm guildId={guildId} settings={row.settings as unknown as Record<string, unknown>} />
        </div>
      ) : null}
    </div>
  );
}

function SettingRow({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[--text-muted]">{label}</dt>
      <dd className="font-mono text-xs text-right">{value ?? "–"}</dd>
    </div>
  );
}
