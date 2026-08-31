import Link from "next/link";
import { requireAuth, getUserGuilds } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  const guilds = await getUserGuilds(user.id);

  return (
    <div className="min-h-screen bg-[--bg-primary] text-[--text-primary]">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-[--border] bg-[--bg-secondary] p-5 hidden lg:flex flex-col">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 mb-2 text-sm font-semibold hover:opacity-80 transition-opacity"
        >
          <BrandMark /> Berlin Roleplay
        </Link>

        <nav className="space-y-4 flex-1 overflow-y-auto">
          <Link
            href="/dashboard"
            className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Übersicht
          </Link>

          {guilds.map((g) => (
            <div key={g.id}>
              <p className="px-3 pb-1 text-xs uppercase tracking-wider text-[--text-muted]">
                {g.name || "Unbenannter Server"}
              </p>
              <SidebarLink href={`/dashboard/${g.id}`} label="Dashboard" />
              <SidebarLink href={`/dashboard/${g.id}/tickets`} label="Tickets" />
              <SidebarLink href={`/dashboard/${g.id}/giveaways`} label="Giveaways" />
              <SidebarLink href={`/dashboard/${g.id}/welcome`} label="Welcome" />
              <SidebarLink href={`/dashboard/${g.id}/verify`} label="Verify" />
              <SidebarLink href={`/dashboard/${g.id}/erlc`} label="ER:LC" />
              <SidebarLink href={`/dashboard/${g.id}/audit`} label="Audit-Log" />
              <SidebarLink href={`/dashboard/${g.id}/stats`} label="Stats" />
            </div>
          ))}
        </nav>

        <div className="pt-4 border-t border-[--border] mt-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar initial={user.username.charAt(0)} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {user.global_name ?? user.username}
              </p>
              <a
                href="/api/auth/logout"
                className="text-xs text-[--text-muted] hover:text-red-400 transition-colors"
              >
                Abmelden
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile: schmale Topbar — Desktop ausgeblendet */}
      <header className="lg:hidden sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[--border] bg-[--bg-secondary]/90 backdrop-blur px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <BrandMark /> Berlin Roleplay
        </Link>
        <div className="flex items-center gap-3">
          <Avatar initial={user.username.charAt(0)} />
          <a
            href="/api/auth/logout"
            className="text-xs text-[--text-muted] hover:text-red-400 transition-colors"
          >
            Logout
          </a>
        </div>
      </header>

      <div className="lg:pl-64">
        <main className="p-5 lg:p-10 max-w-5xl">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-1.5 rounded-lg text-sm text-[--text-muted] hover:text-[--text-primary] hover:bg-white/5 transition-colors"
    >
      {label}
    </Link>
  );
}

function BrandMark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[--accent] text-xs font-bold text-white">
      B
    </span>
  );
}

function Avatar({ initial }: { initial: string }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[--accent] text-sm font-bold text-white">
      {initial.toUpperCase()}
    </span>
  );
}
