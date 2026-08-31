import { renderV2Preview, type V2PreviewSegment } from "@berlin/shared/preview";
import type { V2Layout } from "@berlin/shared/layout";

const SAMPLE_LAYOUT: V2Layout = {
  version: 1,
  children: [
    { type: "text", style: "heading", content: "🎮 Server-Status" },
    { type: "separator", line: true },
    {
      type: "section",
      title: "Berlin Roleplay #1",
      blocks: [
        { type: "text", content: "🟢 Online — 42/100 Spieler" },
        { type: "text", content: "Map: Downtown · Warteschlange: 3" },
      ],
    },
    { type: "separator", line: true },
    {
      type: "row",
      items: [
        { type: "button", label: "Beitreten", style: "success", customId: "join" },
        { type: "button", label: "Details", style: "secondary", customId: "details" },
      ],
    },
  ],
};

const FEATURES = [
  { icon: "🎫", title: "Ticket-System", desc: "Professionelles Support-Ticket mit Panels, Claiming, Transcripts und automatischer Kategorisierung." },
  { icon: "🎉", title: "Giveaways", desc: "Interaktive Giveaways mit Teilnahme-Buttons, Gewinnerziehung und Reroll." },
  { icon: "👋", title: "Willkommen & Verify", desc: "Automatische Begrüßung mit Rollenvergabe und einem eleganten V2-Verifizierungs-Panel." },
  { icon: "🖥️", title: "ER:LC Integration", desc: "Live-Serverstatus, Duty-Tracking, Incident-Management und automatische Panels." },
  { icon: "🧩", title: "Components V2", desc: "Drag-and-Drop Builder für Discord Components V2 — Text, Sections, Buttons, Selects, Media." },
  { icon: "📊", title: "Audit & Stats", desc: "Vollständiges Audit-Log und Statistiken für Tickets, Giveaways und ER:LC-Ereignisse." },
];

const TRUST_STATS = [
  { value: "100%", label: "TypeScript strict" },
  { value: "0", label: "Embeds" },
  { value: "<50ms", label: "Antwortzeit" },
  { value: "24/7", label: "ER:LC Polling" },
];

function V2Preview() {
  const result = renderV2Preview(SAMPLE_LAYOUT);
  if (!result.ok) return <p className="text-red-400 text-sm">Layout-Fehler: {result.errors.join(", ")}</p>;

  return (
    <div className="rounded-xl border border-[#2a2a3e] bg-[#12121e] p-5 font-mono text-sm">
      {result.segments.map((seg, i) => (
        <PreviewSegment key={i} segment={seg} />
      ))}
    </div>
  );
}

function PreviewSegment({ segment }: { segment: V2PreviewSegment }) {
  switch (segment.kind) {
    case "text":
      if (segment.style === "heading") return <h3 className="text-white font-semibold text-base mb-1 mt-3 first:mt-0">{segment.content}</h3>;
      if (segment.style === "list_item") return <li className="text-[#9090a8] ml-4 list-disc">{segment.content}</li>;
      if (segment.style === "code") return <pre className="text-xs text-[#9090a8] bg-[#0a0a12] rounded p-2 mt-2 overflow-x-auto">{segment.content}</pre>;
      return <p className="text-[#c0c0d0] leading-relaxed">{segment.content}</p>;
    case "divider":
      return <hr className="border-[#2a2a3e] my-3" />;
    case "row":
      return (
        <div className="flex gap-2 mt-3">
          {segment.items.map((item, j) =>
            item.kind === "button" ? (
              <span
                key={j}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  item.style === "success" ? "bg-[#3ba55d] text-white" :
                  item.style === "danger" ? "bg-[#ed4245] text-white" :
                  item.style === "link" ? "text-[#5865f2] underline" :
                  "bg-[#2a2a3e] text-[#e8e8f0]"
                }`}
              >
                {item.label}
              </span>
            ) : (
              <span key={j} className="px-3 py-1.5 rounded-md text-xs bg-[#2a2a3e] text-[#9090a8]">
                ▾ {item.label}
              </span>
            )
          )}
        </div>
      );
    case "section":
      return (
        <div className="mt-3">
          {segment.title && <h4 className="text-[#e8e8f0] font-medium text-sm mb-1">{segment.title}</h4>}
          {segment.blocks.map((b, j) => <p key={j} className="text-[#9090a8] text-sm">{b}</p>)}
        </div>
      );
    case "container":
      return (
        <div className="border-l-2 border-[#5865f2] pl-3 my-3">
          {segment.segments.map((s, j) => <PreviewSegment key={j} segment={s} />)}
        </div>
      );
    default:
      return null;
  }
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[#2a2a3e] bg-[#0a0a12]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-white">Berlin Roleplay</span>
          <div className="flex items-center gap-6 text-sm text-[#9090a8]">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#components" className="hover:text-white transition-colors">Components V2</a>
            <a href="#erlc" className="hover:text-white transition-colors">ER:LC</a>
            <a
              href="/dashboard"
              className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4] transition-colors"
            >
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#5865f2]/8 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-32 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Berlin <span className="text-[#5865f2]">Roleplay</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#9090a8] leading-relaxed">
            Professionelles Discord-Bot-System mit Components V2, ER:LC-Integration und vollem Dashboard.
            Keine Embeds. Kein Ballast. Nur moderne Discord-Native-UI.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="rounded-xl bg-[#5865f2] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#4752c4] transition-colors"
            >
              Dashboard öffnen
            </a>
            <a
              href="#features"
              className="rounded-xl border border-[#2a2a3e] px-8 py-3.5 text-base font-semibold text-[#c0c0d0] hover:border-[#5865f2] hover:text-white transition-colors"
            >
              Mehr erfahren
            </a>
          </div>
        </div>
      </section>

      {/* ── Trust Bar ──────────────────────────────────────── */}
      <section className="border-y border-[#2a2a3e] bg-[#12121e]">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
          {TRUST_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-[#5865f2]">{stat.value}</div>
              <div className="mt-1 text-sm text-[#9090a8]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Alles was du brauchst</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-[#9090a8]">
          Vom Ticket-System bis zum ER:LC-Livemonitoring — Berlin Roleplay liefert alle Module aus einer Hand.
        </p>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glow-card rounded-xl border border-[#2a2a3e] bg-[#1a1a2e] p-6 transition-all hover:border-[#5865f2]/50 hover:bg-[#22223a]"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-[#9090a8] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Components V2 ──────────────────────────────────── */}
      <section id="components" className="border-t border-[#2a2a3e] bg-[#12121e]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Components V2 — nativ & live</h2>
              <p className="mt-4 text-[#9090a8] leading-relaxed">
                Keine Embeds mehr. Berlin Roleplay nutzt ausschließlich Discord Components V2 — Text, Sections, Buttons,
                Selects und Media-Galerien. Der gleiche Renderer im Bot und im Dashboard.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-[#9090a8]">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#5865f2]" />
                  Drag-and-Drop Editor im Dashboard
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#5865f2]" />
                  Pixel-genaue Vorschau vor dem Deploy
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#5865f2]" />
                  Serialisierung runden-invariant (Bot = Dashboard)
                </li>
              </ul>
            </div>
            <div>
              <div className="rounded-2xl border border-[#2a2a3e] bg-[#0a0a12] p-6">
                <div className="mb-3 flex items-center gap-2 text-xs text-[#9090a8]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#3ba55d]" />
                  Live-Vorschau
                </div>
                <V2Preview />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ERLC ───────────────────────────────────────────── */}
      <section id="erlc" className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121e] p-6 font-mono text-sm">
              <div className="flex items-center gap-2 text-xs text-[#9090a8] mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3ba55d]" />
                erlc status
              </div>
              <div className="space-y-2">
                <div className="text-white font-semibold">🖥️ Berlin RP #1</div>
                <div className="text-[#3ba55d]">🟢 Online — <span className="text-white">67/100</span> Spieler</div>
                <div className="text-[#9090a8]">Map: Downtown · Warteschlange: 5 · Modded: Ja</div>
                <hr className="border-[#2a2a3e] my-2" />
                <div className="text-[#9090a8]">Version 2.4.1 · FPS 60</div>
              </div>
              <div className="flex gap-2 mt-4">
                <span className="px-3 py-1.5 rounded-md text-xs bg-[#2a2a3e] text-[#e8e8f0]">👥 12 Staff</span>
                <span className="px-3 py-1.5 rounded-md text-xs bg-[#2a2a3e] text-[#e8e8f0]">🏛️ 4 Faktionen</span>
                <span className="px-3 py-1.5 rounded-md text-xs bg-[#3ba55d] text-white">🟢 8 on Duty</span>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">ER:LC — Live & vollautomatisch</h2>
            <p className="mt-4 text-[#9090a8] leading-relaxed">
              Echte ER:LC Private Server API V2. 60-Sekunden-Polling, Duty-Tracking, Incident-Management,
              automatische Status-Panels und Staff-Benachrichtigungen direkt im Discord.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[#9090a8]">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#3ba55d]" />
                Duty beginnen/beenden mit /erlc duty
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#3ba55d]" />
                Vorfälle erstellen und verwalten
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#3ba55d]" />
                Automatische Status-Panels mit Echtzeit-Updates
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#3ba55d]" />
                Webhook-Verifikation für Incident-Automatik
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section id="dashboard" className="border-t border-[#2a2a3e] bg-[#12121e]">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Bereit loszulegen?</h2>
          <p className="mx-auto mt-4 max-w-xl text-[#9090a8]">
            Berlin Roleplay ist free und open-source. Lade den Bot auf deinen Server,
            konfiguriere deine Guild und starte in Minuten.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="rounded-xl bg-[#5865f2] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#4752c4] transition-colors"
            >
              Bot einladen
            </a>
            <a
              href="#"
              className="rounded-xl border border-[#2a2a3e] px-8 py-3.5 text-base font-semibold text-[#c0c0d0] hover:border-[#5865f2] hover:text-white transition-colors"
            >
              Dashboard öffnen
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-[#2a2a3e] bg-[#0a0a12]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-[#9090a8]">
          <span>&copy; {new Date().getFullYear()} Berlin Roleplay</span>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Discord</a>
            <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
