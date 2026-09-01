import { requireGuild } from "@/lib/guild";
import { listComponentTemplates } from "@/lib/queries";
import { ModuleHeader, EmptyState, Panel, formatDate } from "@/components/ui";
import Link from "next/link";

export default async function ComponentsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const templates = await listComponentTemplates(guildId);

  return (
    <div>
      <ModuleHeader
        title={`Components · ${guild.guildName}`}
        description="V2-Template-Liste für Discord-Components und Live-Editor."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href={`/dashboard/${guildId}/components/new`}
          className="rounded-lg bg-[--accent] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[--accent-hover]"
        >
          Neues Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <EmptyState message="Noch keine Components-Templates angelegt." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Panel key={template.id} title={template.name}>
              <div className="space-y-3 text-sm text-[--text-muted]">
                <p>{template.description || "Keine Beschreibung."}</p>
                <div className="flex items-center justify-between gap-3">
                  <span>Version</span>
                  <span className="font-medium text-[--text-primary]">{template.version}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Aktualisiert</span>
                  <span className="font-medium text-[--text-primary]">{formatDate(template.updated_at)}</span>
                </div>
                <Link
                  href={`/dashboard/${guildId}/components/${template.id}`}
                  className="inline-flex rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium text-[--text-primary] transition hover:bg-[--bg-primary]"
                >
                  Bearbeiten
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
