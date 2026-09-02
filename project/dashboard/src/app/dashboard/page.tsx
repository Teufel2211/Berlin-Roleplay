import Link from "next/link";
import { requireAuth, getUserGuilds } from "@/lib/auth";
import { EmptyState } from "@/components/ui";

export default async function DashboardHome() {
  const user = await requireAuth();
  const guilds = await getUserGuilds(user.id);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold">
          Willkommen, {user.global_name ?? user.username}
        </h1>
        <p className="text-sm text-[--text-muted] mt-1">
          Wähle einen Server, um dessen Dashboard zu öffnen.
        </p>
      </header>

      {guilds.length === 0 ? (
        <EmptyState message="Du bist in keinem verwalteten Server Mitglied. Melde dich in einem mit dem Bot verbundenen Discord-Server an." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {guilds.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/${g.id}`}
              className="group glass-card glass-card-hover p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold truncate">{g.name || "Unbenannter Server"}</h3>
                <RoleBadge role={g.role} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[--text-muted]">
                <span className="font-mono">ID: {g.id}</span>
                {g.premium ? (
                  <Badge tone="green">Premium</Badge>
                ) : null}
              </div>
              <span className="mt-4 inline-block text-sm text-[--accent] group-hover:underline">
                Dashboard öffnen →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "red" }) {
  const dotColor = tone === "green" ? "bg-emerald-400" : "bg-red-400";
  const textColor = tone === "green" ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {children}
    </span>
  );
}

function RoleBadge({ role }: { role: "user" | "staff" | "admin" }) {
  const styles =
    role === "admin"
      ? "bg-red-500/15 text-red-400"
      : role === "staff"
        ? "bg-[--accent]/15 text-[--accent]"
        : "bg-white/5 text-[--text-muted]";
  const label = role === "admin" ? "Admin" : role === "staff" ? "Staff" : "User";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
