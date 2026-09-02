import Link from "next/link";
import { requireGuild, getGuildStats } from "@/lib/guild";
import { StatCard } from "@/components/ui";

export default async function GuildDashboardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);
  const stats = await getGuildStats(guild);

  const cards = [
    { label: "Offene Tickets", value: stats.openTickets, href: `${guildId}/tickets` },
    { label: "Aktive Giveaways", value: stats.giveaways, href: `${guildId}/giveaways` },
    { label: "Audit-Einträge", value: stats.auditCount, href: `${guildId}/audit` },
  ];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{guild.guildName}</h1>
        <p className="text-sm text-[--text-muted] mt-1">
          Server-Dashboard · deine Rolle:{" "}
          <span className="text-[--text-primary] font-medium capitalize">
            {guild.role}
          </span>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={`/dashboard/${c.href}`}
            className="glass-card glass-card-hover p-5"
          >
            <p className="text-sm text-[--text-muted]">{c.label}</p>
            <p className="text-3xl font-bold mt-1">{c.value}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4">Verwaltung</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleLink href={`/dashboard/${guildId}/tickets`} title="Tickets" desc="Ticket-Kategorien, Status und Statistiken" />
          <ModuleLink href={`/dashboard/${guildId}/giveaways`} title="Giveaways" desc="Laufende und beendete Giveaways verwalten" />
          <ModuleLink href={`/dashboard/${guildId}/welcome`} title="Welcome" desc="Begrüßungs-Konfiguration" />
          <ModuleLink href={`/dashboard/${guildId}/verify`} title="Verify" desc="Verifizierung einrichten" />
          <ModuleLink href={`/dashboard/${guildId}/components`} title="Components" desc="V2-Template-Liste und Builder-Editor" />
          <ModuleLink href={`/dashboard/${guildId}/erlc`} title="ER:LC" desc="Emergency Response: Liberty County Anbindung" />
          <ModuleLink href={`/dashboard/${guildId}/audit`} title="Audit-Log" desc="Alle Staff-Aktionen im Überblick" />
        </div>
      </section>
    </div>
  );
}

function ModuleLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group glass-card glass-card-hover p-5"
    >
      <h3 className="font-semibold group-hover:text-[--accent] transition-colors">{title}</h3>
      <p className="text-sm text-[--text-muted] mt-1">{desc}</p>
    </Link>
  );
}
