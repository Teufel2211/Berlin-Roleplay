import Link from "next/link";
import { requireAuth, getUserGuilds } from "@/lib/auth";

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
        <div className="rounded-2xl border border-[--border] bg-[--bg-secondary] p-8 text-center">
          <p className="text-[--text-muted] mb-4">
            Du bist in keinem verwalteten Server Mitglied.
          </p>
          <p className="text-xs text-[--text-muted]">
            Melde dich in einem mit dem Bot verbundenen Discord-Server an.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {guilds.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/${g.id}`}
              className="group rounded-2xl border border-[--border] bg-[--bg-secondary] p-5 transition-all hover:border-[--accent]/50 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold truncate">{g.name || "Unbenannter Server"}</h3>
                <RoleBadge role={g.role} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[--text-muted]">
                <span>ID: {g.id}</span>
                {g.premium ? (
                  <span className="text-[--accent]">Premium</span>
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
