import Link from "next/link";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-[--bg-primary] text-[--text-primary]">
      {/* Top-Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[--border] bg-[--bg-secondary]/85 px-4 py-3 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <BrandMark /> Berlin Roleplay <span className="text-xs font-normal text-[--text-muted]">Dashboard</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[--text-muted] sm:inline">
            {user.global_name ?? user.username}
          </span>
          <Avatar initial={user.username.charAt(0)} />
          <a
            href="/api/auth/logout"
            className="text-xs text-[--text-muted] hover:text-red-400 transition-colors"
          >
            Abmelden
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-5 lg:p-10">{children}</main>
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
