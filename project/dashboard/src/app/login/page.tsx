"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = "id" | "code" | "done";

export default function LoginPageClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("id");
  const [discordId, setDiscordId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(codeErrorMessage(data?.error));
        return;
      }
      setStep("code");
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(codeErrorMessage(data?.error));
        return;
      }
      setStep("done");
      router.push(data?.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[--bg-primary] text-[--text-primary]">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 text-sm text-[--text-muted] hover:text-[--text-primary] transition-colors">
          ← Zurück zur Startseite
        </Link>

        <div className="rounded-2xl border border-[--border] bg-[--bg-secondary] p-8 shadow-xl">
          <h1 className="text-2xl font-bold mb-2">Dashboard Login</h1>
          <p className="text-sm text-[--text-muted] mb-6">
            Gib deine Discord-ID ein. Ein Admin erhält anschließend einen
            Login-Code und teilt ihn dir mit. Nur Mitglieder mit Staff- oder
            Admin-Rolle erhalten Zugriff.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {step === "done" ? (
            <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              Anmeldung erfolgreich – du wirst weitergeleitet…
            </div>
          ) : step === "id" ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[--text-muted]">
                  Discord-ID
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  autoComplete="off"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  placeholder="z. B. 1370372526001356972"
                  className="w-full rounded-xl border border-[--border] bg-[--bg-primary] px-4 py-3 text-sm outline-none focus:border-[--accent]"
                />
                <p className="mt-1 text-xs text-[--text-muted]">
                  Deine 17–20-stellige Discord-ID (nicht der Name).
                </p>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[--accent] px-4 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
              >
                {submitting ? "Code wird angefordert…" : "Login-Code anfordern"}
              </button>
            </form>
          ) : (
            <form onSubmit={redeem} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[--text-muted]">
                  Login-Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6-stelliger Code"
                  className="w-full rounded-xl border border-[--border] bg-[--bg-primary] px-4 py-3 text-sm tracking-widest outline-none focus:border-[--accent]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[--accent] px-4 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
              >
                {submitting ? "Wird geprüft…" : "Anmelden"}
              </button>
              <button
                type="button"
                onClick={() => setStep("id")}
                className="w-full rounded-xl border border-[--border] px-4 py-2 text-sm text-[--text-muted] hover:text-[--text-primary]"
              >
                ← Andere Discord-ID verwenden
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function codeErrorMessage(error: string | undefined): string {
  switch (error) {
    case "missing_discord_id":
    case "invalid_discord_id":
      return "Bitte gib eine gültige Discord-ID ein.";
    case "access_denied":
      return "Dein Discord-Konto hat keine Staff- oder Admin-Berechtigung für dieses Dashboard.";
    case "already_used":
      return "Dieser Code wurde bereits verwendet.";
    case "expired":
      return "Dieser Code ist abgelaufen. Bitte fordere einen neuen an.";
    case "invalid_credentials":
      return "Code oder Discord-ID ist nicht korrekt.";
    case "invalid_input":
      return "Ungültige Eingabe.";
    case "not_configured":
      return "Das Dashboard ist noch nicht korrekt konfiguriert.";
    default:
      return "Ein Fehler ist aufgetreten. Bitte erneut versuchen.";
  }
}
