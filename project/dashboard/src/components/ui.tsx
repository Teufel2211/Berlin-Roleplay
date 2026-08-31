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
      <h1 className="text-2xl font-bold">{title}</h1>
      {description ? (
        <p className="text-sm text-[--text-muted] mt-1">{description}</p>
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
    neutral: "bg-[--bg-secondary] text-[--text-muted] border-[--border]",
    green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    red: "bg-red-500/10 text-red-500 border-red-500/30",
    orange: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    blue: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[--border] bg-[--bg-secondary] p-10 text-center">
      <p className="text-[--text-muted]">{message}</p>
    </div>
  );
}

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[--border] bg-[--bg-secondary] p-5">
      {title ? <h2 className="text-lg font-semibold mb-4">{title}</h2> : null}
      {children}
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
