"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarGuild {
  id: string;
  name: string;
}

const GUILD_LINKS: { href: string; label: string }[] = [
  { href: "", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/giveaways", label: "Giveaways" },
  { href: "/welcome", label: "Welcome" },
  { href: "/verify", label: "Verify" },
  { href: "/components", label: "Components" },
  { href: "/erlc", label: "ER:LC" },
  { href: "/audit", label: "Audit-Log" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
];

export function SidebarNav({ guilds }: { guilds: SidebarGuild[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-4 flex-1 overflow-y-auto px-3">
      <Link
        href="/dashboard"
        className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          pathname === "/dashboard"
            ? "bg-[--accent-soft] text-[--text-primary]"
            : "text-[--text-muted] hover:bg-white/5 hover:text-[--text-primary]"
        }`}
      >
        Übersicht
      </Link>

      {guilds.map((g) => (
        <div key={g.id}>
          <p className="px-3 pb-1.5 pt-2 text-xs uppercase tracking-wider text-[--text-muted]/70">
            {g.name || "Unbenannter Server"}
          </p>
          <div className="space-y-0.5">
            {GUILD_LINKS.map((link) => {
              const target = `/dashboard/${g.id}${link.href}`;
              const active =
                pathname === target ||
                (link.href !== "" && pathname?.startsWith(`${target}/`));
              return (
                <Link
                  key={link.label}
                  href={target}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[--accent-soft] font-medium text-[--text-primary]"
                      : "text-[--text-muted] hover:bg-white/5 hover:text-[--text-primary]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
