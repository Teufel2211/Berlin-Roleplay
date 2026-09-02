import type { ReactNode } from "react";

/** Einheitlicher Seitenkopf für Modul-Seiten im Dashboard. */
export function ModuleHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-sm text-[--text-muted] mt-1.5">{description}</p>
      ) : null}
    </header>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "orange" | "blue";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/5 text-[--text-secondary] border-[--border-strong]",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    red: "bg-red-500/10 text-red-400 border-red-500/30",
    orange: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    blue: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur ${tones[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-card flex flex-col items-center justify-center px-10 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-lg text-[--text-secondary]">
        ∅
      </span>
      <p className="text-[--text-muted]">{message}</p>
    </div>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass-card p-5 ${className}`}>
      {title ? <h2 className="text-lg font-semibold mb-4">{title}</h2> : null}
      {children}
    </div>
  );
}

/** Statistische Mini-Karte im Glass-Stil. */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="glass-card glass-card-hover p-5">
      <p className="text-sm text-[--text-muted]">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[--text-muted]">{sub}</p> : null}
    </div>
  );
}

const fmtDate = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return fmtDate.format(d);
}

export function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "–";
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "gerade eben";
}
