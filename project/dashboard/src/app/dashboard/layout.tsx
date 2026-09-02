import Link from "next/link";
import { requireAuth, getUserGuilds } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";

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
      {/* Desktop-Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[--border] bg-[--bg-secondary] backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2 px-6 py-6">
          <BrandMark />
          <div>
            <Link href="/" className="text-sm font-semibold hover:opacity-80 transition-opacity">
              Berlin Roleplay
            </Link>
            <p className="text-xs text-[--text-muted]">Dashboard</p>
          </div>
        </div>

        <SidebarNav guilds={guilds} />

        <div className="border-t border-[--border] p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <Avatar initial={user.username.charAt(0)} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
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

      {/* Mobile: schmale Topbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[--border] bg-[--bg-secondary]/85 px-4 py-3 backdrop-blur-xl lg:hidden">
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
        <main className="mx-auto max-w-5xl p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[--accent] to-[#4752c4] text-sm font-bold text-white shadow-lg shadow-[--accent]/20">
      B
    </span>
  );
}

function Avatar({ initial }: { initial: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[--accent] to-[#4752c4] text-sm font-bold text-white">
      {initial.toUpperCase()}
    </span>
  );
}
